import { type HttpServer } from '@nestjs/common';
import { type Controller } from '@nestjs/common/internal';
import { ApplicationConfig } from '../application-config.js';
import { NestContainer } from '../injector/container.js';
import { Injector } from '../injector/injector.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import { GraphInspector } from '../inspector/graph-inspector.js';
import { ResolvedRoute } from './interfaces/resolved-route.interface.js';
import { Resolver } from './interfaces/resolver.interface.js';
import { RouteResolutionOptions } from './interfaces/route-resolution-options.interface.js';
export declare class RoutesResolver implements Resolver {
    private readonly container;
    private readonly applicationConfig;
    private readonly injector;
    private readonly logger;
    private readonly routerProxy;
    private readonly routePathFactory;
    private readonly routerExceptionsFilter;
    private readonly routerExplorer;
    constructor(container: NestContainer, applicationConfig: ApplicationConfig, injector: Injector, graphInspector: GraphInspector);
    resolve<T extends HttpServer>(applicationRef: T, globalPrefix: string, options?: RouteResolutionOptions): void;
    registerResolvedRoute<T extends HttpServer>(applicationRef: T, route: ResolvedRoute): void;
    registerRouters(routes: Map<string | symbol | Function, InstanceWrapper<Controller>>, moduleName: string, globalPrefix: string, modulePath: string, applicationRef: HttpServer, options?: RouteResolutionOptions): void;
    registerNotFoundHandler(): void;
    registerExceptionHandler(): void;
    private getModulePathMetadata;
    private getHostMetadata;
    private getVersionMetadata;
}
