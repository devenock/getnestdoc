import { pathToRegexp } from 'path-to-regexp';
import { UnknownRequestMappingException } from '../errors/exceptions/unknown-request-mapping.exception.js';
import { GuardsConsumer, GuardsContextCreator } from '../guards/index.js';
import { ContextIdFactory } from '../helpers/context-id-factory.js';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import { ROUTE_MAPPED_MESSAGE, VERSIONED_ROUTE_MAPPED_MESSAGE, } from '../helpers/messages.js';
import { RouterMethodFactory } from '../helpers/router-method-factory.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { InterceptorsConsumer, InterceptorsContextCreator, } from '../interceptors/index.js';
import { PipesConsumer, PipesContextCreator } from '../pipes/index.js';
import { PathsExplorer } from './paths-explorer.js';
import { REQUEST_CONTEXT_ID } from './request/request-constants.js';
import { RouteParamsFactory } from './route-params-factory.js';
import { RouterExecutionContext } from './router-execution-context.js';
import { PATH_METADATA, addLeadingSlash, isUndefined, } from '@nestjs/common/internal';
import { RequestMethod, VersioningType, InternalServerErrorException, Logger, } from '@nestjs/common';
export class RouterExplorer {
    container;
    injector;
    routerProxy;
    exceptionsFilter;
    routePathFactory;
    graphInspector;
    executionContextCreator;
    pathsExplorer;
    routerMethodFactory = new RouterMethodFactory();
    logger = new Logger(RouterExplorer.name, {
        timestamp: true,
    });
    exceptionFiltersCache = new WeakMap();
    constructor(metadataScanner, container, injector, routerProxy, exceptionsFilter, config, routePathFactory, graphInspector) {
        this.container = container;
        this.injector = injector;
        this.routerProxy = routerProxy;
        this.exceptionsFilter = exceptionsFilter;
        this.routePathFactory = routePathFactory;
        this.graphInspector = graphInspector;
        this.pathsExplorer = new PathsExplorer(metadataScanner);
        const routeParamsFactory = new RouteParamsFactory();
        const pipesContextCreator = new PipesContextCreator(container, config);
        const pipesConsumer = new PipesConsumer();
        const guardsContextCreator = new GuardsContextCreator(container, config);
        const guardsConsumer = new GuardsConsumer();
        const interceptorsContextCreator = new InterceptorsContextCreator(container, config);
        const interceptorsConsumer = new InterceptorsConsumer();
        this.executionContextCreator = new RouterExecutionContext(routeParamsFactory, pipesContextCreator, pipesConsumer, guardsContextCreator, guardsConsumer, interceptorsContextCreator, interceptorsConsumer, container.getHttpAdapterRef());
    }
    explore(instanceWrapper, moduleKey, httpAdapterRef, host, routePathMetadata, options = {}) {
        const { instance } = instanceWrapper;
        const routerPaths = this.pathsExplorer.scanForPaths(instance);
        this.applyPathsToRouterProxy(httpAdapterRef, routerPaths, instanceWrapper, moduleKey, routePathMetadata, host, options);
    }
    extractRouterPath(metatype) {
        const path = Reflect.getMetadata(PATH_METADATA, metatype);
        if (isUndefined(path)) {
            throw new UnknownRequestMappingException(metatype);
        }
        if (Array.isArray(path)) {
            return path.map(p => addLeadingSlash(p));
        }
        return [addLeadingSlash(path)];
    }
    applyPathsToRouterProxy(router, routeDefinitions, instanceWrapper, moduleKey, routePathMetadata, host, options = {}) {
        (routeDefinitions || []).forEach(routeDefinition => {
            const { version: methodVersion } = routeDefinition;
            routePathMetadata.methodVersion = methodVersion;
            this.applyCallbackToRouter(router, routeDefinition, instanceWrapper, moduleKey, routePathMetadata, host, options);
        });
    }
    applyCallbackToRouter(router, routeDefinition, instanceWrapper, moduleKey, routePathMetadata, host, options = {}) {
        const { onRouteResolved, deferRegistration = false } = options;
        const { path: paths, requestMethod, targetCallback, methodName, } = routeDefinition;
        const { instance } = instanceWrapper;
        const routerMethodRef = this.routerMethodFactory
            .get(router, requestMethod)
            .bind(router);
        const isRequestScoped = !instanceWrapper.isDependencyTreeStatic();
        const proxy = isRequestScoped
            ? this.createRequestScopedHandler(instanceWrapper, requestMethod, this.container.getModuleByKey(moduleKey), moduleKey, methodName)
            : this.createCallbackProxy(instance, targetCallback, methodName, moduleKey, requestMethod);
        const isVersioned = (routePathMetadata.methodVersion ||
            routePathMetadata.controllerVersion) &&
            routePathMetadata.versioningOptions;
        let routeHandler = this.applyHostFilter(host, proxy);
        paths.forEach(path => {
            if (isVersioned &&
                routePathMetadata.versioningOptions.type !== VersioningType.URI) {
                // All versioning (except for URI Versioning) is done via the "Version Filter"
                routeHandler = this.applyVersionFilter(router, routePathMetadata, routeHandler);
            }
            routePathMetadata.methodPath = path;
            const pathsToRegister = this.routePathFactory.create(routePathMetadata, requestMethod);
            pathsToRegister.forEach(path => {
                const normalizedPath = router.normalizePath
                    ? router.normalizePath(path)
                    : path;
                const entrypointDefinition = {
                    type: 'http-endpoint',
                    methodName,
                    className: instanceWrapper.name,
                    classNodeId: instanceWrapper.id,
                    metadata: {
                        key: path,
                        path,
                        requestMethod: RequestMethod[requestMethod],
                        methodVersion: routePathMetadata.methodVersion,
                        controllerVersion: routePathMetadata.controllerVersion,
                    },
                };
                if (!deferRegistration) {
                    this.copyMetadataToCallback(targetCallback, routeHandler);
                    const httpAdapter = this.container.getHttpAdapterRef();
                    const onRouteTriggered = httpAdapter.getOnRouteTriggered?.();
                    if (onRouteTriggered) {
                        routerMethodRef(normalizedPath, (...args) => {
                            onRouteTriggered(requestMethod, path);
                            return routeHandler(...args);
                        });
                    }
                    else {
                        routerMethodRef(normalizedPath, routeHandler);
                    }
                }
                onRouteResolved?.({
                    method: requestMethod,
                    path: normalizedPath,
                    rawPath: path,
                    host,
                    version: routePathMetadata.methodVersion ??
                        routePathMetadata.controllerVersion,
                    methodVersion: routePathMetadata.methodVersion,
                    controllerVersion: routePathMetadata.controllerVersion,
                    handler: routeHandler,
                    targetCallback,
                    methodName,
                    instanceWrapper,
                });
                this.graphInspector.insertEntrypointDefinition(entrypointDefinition, instanceWrapper.id);
            });
            const pathsToLog = this.routePathFactory.create({
                ...routePathMetadata,
                versioningOptions: undefined,
            }, requestMethod);
            pathsToLog.forEach(path => {
                if (isVersioned) {
                    const version = this.routePathFactory.getVersion(routePathMetadata);
                    this.logger.log(VERSIONED_ROUTE_MAPPED_MESSAGE(path, requestMethod, version));
                }
                else {
                    this.logger.log(ROUTE_MAPPED_MESSAGE(path, requestMethod));
                }
            });
        });
    }
    /**
     * Registers a previously resolved route on the underlying HTTP adapter.
     * Used when route registration has been deferred (e.g. when sorting
     * routes by specificity) so the caller can choose the order in which
     * routes are installed on the adapter.
     */
    registerResolvedRoute(router, route) {
        const routerMethodRef = this.routerMethodFactory
            .get(router, route.method)
            .bind(router);
        this.copyMetadataToCallback(route.targetCallback, route.handler);
        const normalizedPath = route.path;
        const rawPath = route.rawPath ?? route.path;
        const httpAdapter = this.container.getHttpAdapterRef();
        const onRouteTriggered = httpAdapter.getOnRouteTriggered?.();
        if (onRouteTriggered) {
            routerMethodRef(normalizedPath, (...args) => {
                onRouteTriggered(route.method, rawPath);
                return route.handler(...args);
            });
        }
        else {
            routerMethodRef(normalizedPath, route.handler);
        }
    }
    applyHostFilter(host, handler) {
        if (!host) {
            return handler;
        }
        const httpAdapterRef = this.container.getHttpAdapterRef();
        const hosts = Array.isArray(host) ? host : [host];
        const hostRegExps = hosts.map((host) => {
            if (typeof host === 'string') {
                try {
                    return pathToRegexp(host);
                }
                catch (e) {
                    if (e instanceof TypeError) {
                        this.logger.error(`Unsupported host "${host}" syntax. In past releases, ?, *, and + were used to denote optional or repeating path parameters. The latest version of "path-to-regexp" now requires the use of named parameters. For example, instead of using a route like /users/* to capture all routes starting with "/users", you should use /users/*path. Please see the migration guide for more information.`);
                    }
                    throw e;
                }
            }
            return { regexp: host, keys: [] };
        });
        const unsupportedFilteringErrorMessage = Array.isArray(host)
            ? `HTTP adapter does not support filtering on hosts: ["${host.join('", "')}"]`
            : `HTTP adapter does not support filtering on host: "${host}"`;
        return (req, res, next) => {
            req.hosts = {};
            const hostname = httpAdapterRef.getRequestHostname(req) || '';
            for (const exp of hostRegExps) {
                const match = hostname.match(exp.regexp);
                if (match) {
                    if (exp.keys.length > 0) {
                        exp.keys.forEach((key, i) => (req.hosts[key.name] = match[i + 1]));
                    }
                    else if (exp.regexp && match.groups) {
                        for (const groupName in match.groups) {
                            req.hosts[groupName] = match.groups[groupName];
                        }
                    }
                    return handler(req, res, next);
                }
            }
            if (!next) {
                throw new InternalServerErrorException(unsupportedFilteringErrorMessage);
            }
            return next();
        };
    }
    applyVersionFilter(router, routePathMetadata, handler) {
        const version = this.routePathFactory.getVersion(routePathMetadata);
        return router.applyVersionFilter(handler, version, routePathMetadata.versioningOptions);
    }
    createCallbackProxy(instance, callback, methodName, moduleRef, requestMethod, contextId = STATIC_CONTEXT, inquirerId) {
        const executionContext = this.executionContextCreator.create(instance, callback, methodName, moduleRef, requestMethod, contextId, inquirerId);
        const exceptionFilter = this.exceptionsFilter.create(instance, callback, moduleRef, contextId, inquirerId);
        return this.routerProxy.createProxy(executionContext, exceptionFilter);
    }
    createRequestScopedHandler(instanceWrapper, requestMethod, moduleRef, moduleKey, methodName) {
        const { instance } = instanceWrapper;
        const collection = moduleRef.controllers;
        const isTreeDurable = instanceWrapper.isDependencyTreeDurable();
        return async (req, res, next) => {
            try {
                const contextId = this.getContextId(req, isTreeDurable);
                const contextInstance = await this.injector.loadPerContext(instance, moduleRef, collection, contextId);
                await this.createCallbackProxy(contextInstance, contextInstance[methodName], methodName, moduleKey, requestMethod, contextId, instanceWrapper.id)(req, res, next);
            }
            catch (err) {
                let exceptionFilter = this.exceptionFiltersCache.get(instance[methodName]);
                if (!exceptionFilter) {
                    exceptionFilter = this.exceptionsFilter.create(instance, instance[methodName], moduleKey);
                    this.exceptionFiltersCache.set(instance[methodName], exceptionFilter);
                }
                const host = new ExecutionContextHost([req, res, next]);
                exceptionFilter.next(err, host);
            }
        };
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
    copyMetadataToCallback(originalCallback, targetCallback) {
        for (const key of Reflect.getMetadataKeys(originalCallback)) {
            Reflect.defineMetadata(key, Reflect.getMetadata(key, originalCallback), targetCallback);
        }
    }
}
