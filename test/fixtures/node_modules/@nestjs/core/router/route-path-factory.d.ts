import { type RequestMethod, type VersioningOptions } from '@nestjs/common';
import { ApplicationConfig } from '../application-config.js';
import { RoutePathMetadata } from './interfaces/route-path-metadata.interface.js';
import { type VersionValue } from '@nestjs/common/internal';
export declare class RoutePathFactory {
    private readonly applicationConfig;
    constructor(applicationConfig: ApplicationConfig);
    create(metadata: RoutePathMetadata, requestMethod?: RequestMethod): string[];
    getVersion(metadata: RoutePathMetadata): VersionValue | undefined;
    getVersionPrefix(versioningOptions: VersioningOptions): string;
    appendToAllIfDefined(paths: string[], fragmentToAppend: string | string[] | undefined): string[];
    isExcludedFromGlobalPrefix(path: string, requestMethod?: RequestMethod, versionOrVersions?: VersionValue, versioningOptions?: VersioningOptions): boolean;
    private truncateVersionPrefixFromPath;
}
