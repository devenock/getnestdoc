import { VERSION_NEUTRAL, VersioningType, flatten, } from '@nestjs/common';
import { isRouteExcluded } from './utils/index.js';
import { addLeadingSlash, isUndefined, stripEndSlash, } from '@nestjs/common/internal';
export class RoutePathFactory {
    applicationConfig;
    constructor(applicationConfig) {
        this.applicationConfig = applicationConfig;
    }
    create(metadata, requestMethod) {
        let paths = [''];
        const versionOrVersions = this.getVersion(metadata);
        if (versionOrVersions &&
            metadata.versioningOptions?.type === VersioningType.URI) {
            const versionPrefix = this.getVersionPrefix(metadata.versioningOptions);
            if (Array.isArray(versionOrVersions)) {
                paths = flatten(paths.map(path => versionOrVersions.map(version => 
                // Version Neutral - Do not include version in URL
                version === VERSION_NEUTRAL
                    ? path
                    : `${path}/${versionPrefix}${version}`)));
            }
            else {
                // Version Neutral - Do not include version in URL
                if (versionOrVersions !== VERSION_NEUTRAL) {
                    paths = paths.map(path => `${path}/${versionPrefix}${versionOrVersions}`);
                }
            }
        }
        paths = this.appendToAllIfDefined(paths, metadata.modulePath);
        paths = this.appendToAllIfDefined(paths, metadata.ctrlPath);
        paths = this.appendToAllIfDefined(paths, metadata.methodPath);
        if (metadata.globalPrefix) {
            paths = paths.map(path => {
                if (this.isExcludedFromGlobalPrefix(path, requestMethod, versionOrVersions, metadata.versioningOptions)) {
                    return path;
                }
                return stripEndSlash(metadata.globalPrefix || '') + path;
            });
        }
        return paths
            .map(path => addLeadingSlash(path || '/'))
            .map(path => (path !== '/' ? stripEndSlash(path) : path));
    }
    getVersion(metadata) {
        // The version will be either the path version or the controller version,
        // with the pathVersion taking priority.
        return metadata.methodVersion || metadata.controllerVersion;
    }
    getVersionPrefix(versioningOptions) {
        const defaultPrefix = 'v';
        if (versioningOptions.type === VersioningType.URI) {
            if (versioningOptions.prefix === false) {
                return '';
            }
            else if (versioningOptions.prefix !== undefined) {
                return versioningOptions.prefix;
            }
        }
        return defaultPrefix;
    }
    appendToAllIfDefined(paths, fragmentToAppend) {
        if (!fragmentToAppend) {
            return paths;
        }
        const concatPaths = (a, b) => stripEndSlash(a) + addLeadingSlash(b);
        if (Array.isArray(fragmentToAppend)) {
            const paths2dArray = paths.map(path => fragmentToAppend.map(fragment => concatPaths(path, fragment)));
            return flatten(paths2dArray);
        }
        return paths.map(path => concatPaths(path, fragmentToAppend));
    }
    isExcludedFromGlobalPrefix(path, requestMethod, versionOrVersions, versioningOptions) {
        if (isUndefined(requestMethod)) {
            return false;
        }
        const options = this.applicationConfig.getGlobalPrefixOptions();
        const excludedRoutes = options.exclude;
        if (versionOrVersions &&
            versionOrVersions !== VERSION_NEUTRAL &&
            versioningOptions?.type === VersioningType.URI) {
            path = this.truncateVersionPrefixFromPath(path, versionOrVersions, versioningOptions);
        }
        return (Array.isArray(excludedRoutes) &&
            isRouteExcluded(excludedRoutes, path, requestMethod));
    }
    truncateVersionPrefixFromPath(path, versionValue, versioningOptions) {
        if (typeof versionValue !== 'string') {
            versionValue.forEach(version => {
                if (typeof version === 'string') {
                    path = this.truncateVersionPrefixFromPath(path, version, versioningOptions);
                }
            });
            return path;
        }
        const prefix = `/${this.getVersionPrefix(versioningOptions)}${versionValue}`;
        return path.startsWith(prefix) ? path.replace(prefix, '') : path;
    }
}
