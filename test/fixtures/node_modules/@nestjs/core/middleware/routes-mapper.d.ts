import { ApplicationConfig } from '../application-config.js';
import { NestContainer } from '../injector/container.js';
import { type RouteInfo } from '@nestjs/common/internal';
import { type Type } from '@nestjs/common';
export declare class RoutesMapper {
    private readonly container;
    private readonly applicationConfig;
    private readonly pathsExplorer;
    constructor(container: NestContainer, applicationConfig: ApplicationConfig);
    mapRouteToRouteInfo(controllerOrRoute: Type<any> | RouteInfo | string): RouteInfo[];
    private getRouteInfoFromPath;
    private getRouteInfoFromObject;
    private getRouteInfoFromController;
    private isRouteInfo;
    private normalizeGlobalPath;
    private getRoutePath;
    private getHostModuleOfController;
    private getModulePath;
    private getVersionMetadata;
}
