import { ApplicationConfig } from '../application-config.js';
import { type RouteInfo } from '@nestjs/common/internal';
export declare class RouteInfoPathExtractor {
    private readonly applicationConfig;
    private readonly routePathFactory;
    private readonly prefixPath;
    private readonly excludedGlobalPrefixRoutes;
    private readonly versioningConfig?;
    constructor(applicationConfig: ApplicationConfig);
    extractPathsFrom({ path, method, version }: RouteInfo): string[];
    extractPathFrom(route: RouteInfo): string[];
    private isAWildcard;
    private extractNonWildcardPathsFrom;
    private extractVersionPathFrom;
}
