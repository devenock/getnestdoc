import { Logger, NotFoundException, } from '@nestjs/common';
import { HOST_METADATA, MODULE_PATH, VERSION_METADATA, } from '@nestjs/common/internal';
import { CONTROLLER_MAPPING_MESSAGE, VERSIONED_CONTROLLER_MAPPING_MESSAGE, } from '../helpers/messages.js';
import { MetadataScanner } from '../metadata-scanner.js';
import { RoutePathFactory } from './route-path-factory.js';
import { RouterExceptionFilters } from './router-exception-filters.js';
import { RouterExplorer } from './router-explorer.js';
import { RouterProxy } from './router-proxy.js';
export class RoutesResolver {
    container;
    applicationConfig;
    injector;
    logger = new Logger(RoutesResolver.name, {
        timestamp: true,
    });
    routerProxy = new RouterProxy();
    routePathFactory;
    routerExceptionsFilter;
    routerExplorer;
    constructor(container, applicationConfig, injector, graphInspector) {
        this.container = container;
        this.applicationConfig = applicationConfig;
        this.injector = injector;
        const httpAdapterRef = container.getHttpAdapterRef();
        this.routerExceptionsFilter = new RouterExceptionFilters(container, applicationConfig, httpAdapterRef);
        this.routePathFactory = new RoutePathFactory(this.applicationConfig);
        const metadataScanner = new MetadataScanner();
        this.routerExplorer = new RouterExplorer(metadataScanner, this.container, this.injector, this.routerProxy, this.routerExceptionsFilter, this.applicationConfig, this.routePathFactory, graphInspector);
    }
    resolve(applicationRef, globalPrefix, options = {}) {
        const modules = this.container.getModules();
        modules.forEach(({ controllers, metatype }, moduleName) => {
            const modulePath = this.getModulePathMetadata(metatype);
            this.registerRouters(controllers, moduleName, globalPrefix, modulePath, applicationRef, options);
        });
    }
    registerResolvedRoute(applicationRef, route) {
        this.routerExplorer.registerResolvedRoute(applicationRef, route);
    }
    registerRouters(routes, moduleName, globalPrefix, modulePath, applicationRef, options = {}) {
        routes.forEach(instanceWrapper => {
            const { metatype } = instanceWrapper;
            const host = this.getHostMetadata(metatype);
            const routerPaths = this.routerExplorer.extractRouterPath(metatype);
            const controllerVersion = this.getVersionMetadata(metatype);
            const controllerName = metatype.name;
            routerPaths.forEach(path => {
                const pathsToLog = this.routePathFactory.create({
                    ctrlPath: path,
                    modulePath,
                    globalPrefix,
                });
                if (!controllerVersion) {
                    pathsToLog.forEach(path => {
                        const logMessage = CONTROLLER_MAPPING_MESSAGE(controllerName, path);
                        this.logger.log(logMessage);
                    });
                }
                else {
                    pathsToLog.forEach(path => {
                        const logMessage = VERSIONED_CONTROLLER_MAPPING_MESSAGE(controllerName, path, controllerVersion);
                        this.logger.log(logMessage);
                    });
                }
                const versioningOptions = this.applicationConfig.getVersioning();
                const routePathMetadata = {
                    ctrlPath: path,
                    modulePath,
                    globalPrefix,
                    controllerVersion,
                    versioningOptions,
                };
                this.routerExplorer.explore(instanceWrapper, moduleName, applicationRef, host, routePathMetadata, options);
            });
        });
    }
    registerNotFoundHandler() {
        const applicationRef = this.container.getHttpAdapterRef();
        const callback = (req, res) => {
            const method = applicationRef.getRequestMethod(req);
            const url = applicationRef.getRequestUrl(req);
            throw new NotFoundException(`Cannot ${method} ${url}`);
        };
        const handler = this.routerExceptionsFilter.create({}, callback, undefined);
        const proxy = this.routerProxy.createProxy(callback, handler);
        const prefix = this.applicationConfig.getGlobalPrefix();
        applicationRef.setNotFoundHandler &&
            applicationRef.setNotFoundHandler(proxy, prefix);
    }
    registerExceptionHandler() {
        const callback = (err, req, res, next) => {
            throw this.container.getHttpAdapterRef().mapException(err);
        };
        const handler = this.routerExceptionsFilter.create({}, callback, undefined);
        const proxy = this.routerProxy.createExceptionLayerProxy(callback, handler);
        const applicationRef = this.container.getHttpAdapterRef();
        const prefix = this.applicationConfig.getGlobalPrefix();
        applicationRef.setErrorHandler &&
            applicationRef.setErrorHandler(proxy, prefix);
    }
    getModulePathMetadata(metatype) {
        const modulesContainer = this.container.getModules();
        const modulePath = Reflect.getMetadata(MODULE_PATH + modulesContainer.applicationId, metatype);
        return modulePath ?? Reflect.getMetadata(MODULE_PATH, metatype);
    }
    getHostMetadata(metatype) {
        return Reflect.getMetadata(HOST_METADATA, metatype);
    }
    getVersionMetadata(metatype) {
        const versioningConfig = this.applicationConfig.getVersioning();
        if (versioningConfig) {
            return (Reflect.getMetadata(VERSION_METADATA, metatype) ??
                versioningConfig.defaultVersion);
        }
    }
}
