import { MetadataScanner } from '../metadata-scanner.js';
import { RouterProxyCallback } from './router-proxy.js';
import { type Controller, type VersionValue } from '@nestjs/common/internal';
import type { RequestMethod } from '@nestjs/common';
export interface RouteDefinition {
    path: string[];
    requestMethod: RequestMethod;
    targetCallback: RouterProxyCallback;
    methodName: string;
    version?: VersionValue;
}
export declare class PathsExplorer {
    private readonly metadataScanner;
    constructor(metadataScanner: MetadataScanner);
    scanForPaths(instance: Controller, prototype?: object): RouteDefinition[];
    exploreMethodMetadata(instance: Controller, prototype: object, methodName: string): RouteDefinition | null;
}
