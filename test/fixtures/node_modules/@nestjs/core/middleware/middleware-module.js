import { Logger } from '@nestjs/common';
import { InvalidMiddlewareException } from '../errors/exceptions/invalid-middleware.exception.js';
import { RuntimeException } from '../errors/exceptions/runtime.exception.js';
import { ContextIdFactory } from '../helpers/context-id-factory.js';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { REQUEST_CONTEXT_ID } from '../router/request/request-constants.js';
import { RouterExceptionFilters } from '../router/router-exception-filters.js';
import { RouterProxy } from '../router/router-proxy.js';
import { isRequestMethodAll } from '../router/utils/index.js';
import { MiddlewareBuilder } from './builder.js';
import { MiddlewareResolver } from './resolver.js';
import { RouteInfoPathExtractor } from './route-info-path-extractor.js';
import { RoutesMapper } from './routes-mapper.js';
import { RequestMethod } from '@nestjs/common';
import { isUndefined, } from '@nestjs/common/internal';
export class MiddlewareModule {
    routerProxy = new RouterProxy();
    exceptionFiltersCache = new WeakMap();
    logger = new Logger(MiddlewareModule.name);
    injector;
    routerExceptionFilter;
    routesMapper;
    resolver;
    container;
    httpAdapter;
    graphInspector;
    appOptions;
    routeInfoPathExtractor;
    async register(middlewareContainer, container, config, injector, httpAdapter, graphInspector, options) {
        this.appOptions = options;
        const appRef = container.getHttpAdapterRef();
        this.routerExceptionFilter = new RouterExceptionFilters(container, config, appRef);
        this.routesMapper = new RoutesMapper(container, config);
        this.resolver = new MiddlewareResolver(middlewareContainer, injector);
        this.routeInfoPathExtractor = new RouteInfoPathExtractor(config);
        this.injector = injector;
        this.container = container;
        this.httpAdapter = httpAdapter;
        this.graphInspector = graphInspector;
        const modules = container.getModules();
        await this.resolveMiddleware(middlewareContainer, modules);
    }
    async resolveMiddleware(middlewareContainer, modules) {
        const moduleEntries = [...modules.entries()];
        const loadMiddlewareConfiguration = async ([moduleName, moduleRef]) => {
            await this.loadConfiguration(middlewareContainer, moduleRef, moduleName);
            await this.resolver.resolveInstances(moduleRef, moduleName);
        };
        await Promise.all(moduleEntries.map(loadMiddlewareConfiguration));
    }
    async loadConfiguration(middlewareContainer, moduleRef, moduleKey) {
        const { instance } = moduleRef;
        if (!instance.configure) {
            return;
        }
        const middlewareBuilder = new MiddlewareBuilder(this.routesMapper, this.httpAdapter, this.routeInfoPathExtractor);
        try {
            await instance.configure(middlewareBuilder);
        }
        catch (err) {
            if (!this.appOptions.preview) {
                throw err;
            }
            const warningMessage = `Warning! "${moduleRef.name}" module exposes a "configure" method that throws an exception in the preview mode` +
                ` (possibly due to missing dependencies). Note: you can ignore this message, just be aware that some of those conditional middlewares will not be reflected in your graph.`;
            this.logger.warn(warningMessage);
        }
        if (!(middlewareBuilder instanceof MiddlewareBuilder)) {
            return;
        }
        const config = middlewareBuilder.build();
        middlewareContainer.insertConfig(config, moduleKey);
    }
    async registerMiddleware(middlewareContainer, applicationRef) {
        const configs = middlewareContainer.getConfigurations();
        const registerAllConfigs = async (moduleKey, middlewareConfig) => {
            for (const config of middlewareConfig) {
                await this.registerMiddlewareConfig(middlewareContainer, config, moduleKey, applicationRef);
            }
        };
        const entriesSortedByDistance = [...configs.entries()].sort(([moduleA], [moduleB]) => {
            const moduleARef = this.container.getModuleByKey(moduleA);
            const moduleBRef = this.container.getModuleByKey(moduleB);
            const isModuleAGlobal = moduleARef.distance === Number.MAX_VALUE;
            const isModuleBGlobal = moduleBRef.distance === Number.MAX_VALUE;
            if (isModuleAGlobal && isModuleBGlobal) {
                return 0;
            }
            if (isModuleAGlobal) {
                return -1;
            }
            if (isModuleBGlobal) {
                return 1;
            }
            return moduleARef.distance - moduleBRef.distance;
        });
        for (const [moduleRef, moduleConfigurations] of entriesSortedByDistance) {
            await registerAllConfigs(moduleRef, [...moduleConfigurations]);
        }
    }
    async registerMiddlewareConfig(middlewareContainer, config, moduleKey, applicationRef) {
        const { forRoutes } = config;
        for (const routeInfo of forRoutes) {
            await this.registerRouteMiddleware(middlewareContainer, routeInfo, config, moduleKey, applicationRef);
        }
    }
    async registerRouteMiddleware(middlewareContainer, routeInfo, config, moduleKey, applicationRef) {
        const middlewareCollection = [].concat(config.middleware);
        const moduleRef = this.container.getModuleByKey(moduleKey);
        for (const metatype of middlewareCollection) {
            const collection = middlewareContainer.getMiddlewareCollection(moduleKey);
            const instanceWrapper = collection.get(metatype);
            if (isUndefined(instanceWrapper)) {
                throw new RuntimeException();
            }
            if (instanceWrapper.isTransient) {
                return;
            }
            this.graphInspector.insertClassNode(moduleRef, instanceWrapper, 'middleware');
            const middlewareDefinition = {
                type: 'middleware',
                methodName: 'use',
                className: instanceWrapper.name,
                classNodeId: instanceWrapper.id,
                metadata: {
                    key: routeInfo.path,
                    path: routeInfo.path,
                    requestMethod: RequestMethod[routeInfo.method] ??
                        'ALL',
                    version: routeInfo.version,
                },
            };
            this.graphInspector.insertEntrypointDefinition(middlewareDefinition, instanceWrapper.id);
            await this.bindHandler(instanceWrapper, applicationRef, routeInfo, moduleRef, collection);
        }
    }
    async bindHandler(wrapper, applicationRef, routeInfo, moduleRef, collection) {
        const { instance, metatype } = wrapper;
        if (isUndefined(instance?.use)) {
            throw new InvalidMiddlewareException(metatype.name);
        }
        const isStatic = wrapper.isDependencyTreeStatic();
        if (isStatic) {
            const proxy = await this.createProxy(instance);
            return this.registerHandler(applicationRef, routeInfo, proxy);
        }
        const isTreeDurable = wrapper.isDependencyTreeDurable();
        await this.registerHandler(applicationRef, routeInfo, async (req, res, next) => {
            try {
                const contextId = this.getContextId(req, isTreeDurable);
                const contextInstance = await this.injector.loadPerContext(instance, moduleRef, collection, contextId);
                const proxy = await this.createProxy(contextInstance, contextId);
                return proxy(req, res, next);
            }
            catch (err) {
                let exceptionsHandler = this.exceptionFiltersCache.get(instance.use);
                if (!exceptionsHandler) {
                    exceptionsHandler = this.routerExceptionFilter.create(instance, instance.use, undefined);
                    this.exceptionFiltersCache.set(instance.use, exceptionsHandler);
                }
                const host = new ExecutionContextHost([req, res, next]);
                exceptionsHandler.next(err, host);
            }
        });
    }
    async createProxy(instance, contextId = STATIC_CONTEXT) {
        const exceptionsHandler = this.routerExceptionFilter.create(instance, instance.use, undefined, contextId);
        const middleware = instance.use.bind(instance);
        return this.routerProxy.createProxy(middleware, exceptionsHandler);
    }
    async registerHandler(applicationRef, routeInfo, proxy) {
        const { method } = routeInfo;
        const paths = this.routeInfoPathExtractor.extractPathsFrom(routeInfo);
        const isMethodAll = isRequestMethodAll(method);
        const requestMethod = RequestMethod[method];
        const router = await applicationRef.createMiddlewareFactory(method);
        const middlewareFunction = isMethodAll
            ? proxy
            : (req, res, next) => {
                const actualRequestMethod = applicationRef.getRequestMethod?.(req);
                if (actualRequestMethod === requestMethod ||
                    (actualRequestMethod === RequestMethod[RequestMethod.HEAD] &&
                        requestMethod === RequestMethod[RequestMethod.GET])) {
                    return proxy(req, res, next);
                }
                return next();
            };
        const pathsToApplyMiddleware = [];
        paths.some(path => path.match(/^\/?$/))
            ? pathsToApplyMiddleware.push('/')
            : pathsToApplyMiddleware.push(...paths);
        pathsToApplyMiddleware.forEach(path => router(path, middlewareFunction));
    }
    getContextId(request, isTreeDurable) {
        const contextId = ContextIdFactory.getByRequest(request);
        if (!request[REQUEST_CONTEXT_ID]) {
            Object.defineProperty(request, REQUEST_CONTEXT_ID, {
                value: contextId,
                enumerable: false,
                writable: false,
                configurable: false,
            });
            const requestProviderValue = isTreeDurable
                ? contextId.payload
                : Object.assign(request, contextId.payload);
            this.container.registerRequestProvider(requestProviderValue, contextId);
        }
        return contextId;
    }
}
