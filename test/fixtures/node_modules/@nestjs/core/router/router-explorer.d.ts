import type { HttpServer } from '@nestjs/common';
import { ApplicationConfig } from '../application-config.js';
import { NestContainer } from '../injector/container.js';
import { Injector } from '../injector/injector.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import { Module } from '../injector/module.js';
import { GraphInspector } from '../inspector/graph-inspector.js';
import { MetadataScanner } from '../metadata-scanner.js';
import { ExceptionsFilter } from './interfaces/exceptions-filter.interface.js';
import { ResolvedRoute } from './interfaces/resolved-route.interface.js';
import { RoutePathMetadata } from './interfaces/route-path-metadata.interface.js';
import { RouteResolutionOptions } from './interfaces/route-resolution-options.interface.js';
import { RoutePathFactory } from './route-path-factory.js';
import { RouterProxy, RouterProxyCallback } from './router-proxy.js';
import { type Controller, type VersionValue } from '@nestjs/common/internal';
import { RequestMethod, type Type } from '@nestjs/common';
export interface RouteDefinition {
    path: string[];
    requestMethod: RequestMethod;
    targetCallback: RouterProxyCallback;
    methodName: string;
    version?: VersionValue;
}
export declare class RouterExplorer {
    private readonly container;
    private readonly injector;
    private readonly routerProxy;
    private readonly exceptionsFilter;
    private readonly routePathFactory;
    private readonly graphInspector;
    private readonly executionContextCreator;
    private readonly pathsExplorer;
    private readonly routerMethodFactory;
    private readonly logger;
    private readonly exceptionFiltersCache;
    constructor(metadataScanner: MetadataScanner, container: NestContainer, injector: Injector, routerProxy: RouterProxy, exceptionsFilter: ExceptionsFilter, config: ApplicationConfig, routePathFactory: RoutePathFactory, graphInspector: GraphInspector);
    explore<T extends HttpServer = any>(instanceWrapper: InstanceWrapper, moduleKey: string, httpAdapterRef: T, host: string | RegExp | Array<string | RegExp>, routePathMetadata: RoutePathMetadata, options?: RouteResolutionOptions): void;
    extractRouterPath(metatype: Type<Controller>): string[];
    applyPathsToRouterProxy<T extends HttpServer>(router: T, routeDefinitions: RouteDefinition[], instanceWrapper: InstanceWrapper, moduleKey: string, routePathMetadata: RoutePathMetadata, host: string | RegExp | Array<string | RegExp>, options?: RouteResolutionOptions): void;
    private applyCallbackToRouter;
    /**
     * Registers a previously resolved route on the underlying HTTP adapter.
     * Used when route registration has been deferred (e.g. when sorting
     * routes by specificity) so the caller can choose the order in which
     * routes are installed on the adapter.
     */
    registerResolvedRoute<T extends HttpServer>(router: T, route: ResolvedRoute): void;
    private applyHostFilter;
    private applyVersionFilter;
    private createCallbackProxy;
    createRequestScopedHandler(instanceWrapper: InstanceWrapper, requestMethod: RequestMethod, moduleRef: Module, moduleKey: string, methodName: string): <TRequest extends Record<any, any>, TResponse>(req: TRequest, res: TResponse, next: () => void) => Promise<void>;
    private getContextId;
    private copyMetadataToCallback;
}
