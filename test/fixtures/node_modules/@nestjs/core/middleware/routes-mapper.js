import { MetadataScanner } from '../metadata-scanner.js';
import { PathsExplorer } from '../router/paths-explorer.js';
import { targetModulesByContainer } from '../router/router-module.js';
import { MODULE_PATH, PATH_METADATA, VERSION_METADATA, addLeadingSlash, isString, isUndefined, } from '@nestjs/common/internal';
import { VERSION_NEUTRAL } from '@nestjs/common';
export class RoutesMapper {
    container;
    applicationConfig;
    pathsExplorer;
    constructor(container, applicationConfig) {
        this.container = container;
        this.applicationConfig = applicationConfig;
        this.pathsExplorer = new PathsExplorer(new MetadataScanner());
    }
    mapRouteToRouteInfo(controllerOrRoute) {
        if (isString(controllerOrRoute)) {
            return this.getRouteInfoFromPath(controllerOrRoute);
        }
        const routePathOrPaths = this.getRoutePath(controllerOrRoute);
        if (this.isRouteInfo(routePathOrPaths, controllerOrRoute)) {
            return this.getRouteInfoFromObject(controllerOrRoute);
        }
        return this.getRouteInfoFromController(controllerOrRoute, routePathOrPaths);
    }
    getRouteInfoFromPath(routePath) {
        const defaultRequestMethod = -1;
        return [
            {
                path: addLeadingSlash(routePath),
                method: defaultRequestMethod,
            },
        ];
    }
    getRouteInfoFromObject(routeInfoObject) {
        const routeInfo = {
            path: addLeadingSlash(routeInfoObject.path),
            method: routeInfoObject.method,
        };
        if (routeInfoObject.version) {
            routeInfo.version = routeInfoObject.version;
        }
        return [routeInfo];
    }
    getRouteInfoFromController(controller, routePath) {
        const controllerPaths = this.pathsExplorer.scanForPaths(Object.create(controller), controller.prototype);
        const controllerVersion = this.getVersionMetadata(controller);
        const versioningConfig = this.applicationConfig.getVersioning();
        const moduleRef = this.getHostModuleOfController(controller);
        const modulePath = this.getModulePath(moduleRef?.metatype);
        const concatPaths = (acc, currentValue) => acc.concat(currentValue);
        const toUndefinedIfNeural = (version) => version === VERSION_NEUTRAL ? undefined : version;
        const toRouteInfo = (item, prefix) => item.path?.flatMap(p => {
            let endpointPath = modulePath ?? '';
            endpointPath += this.normalizeGlobalPath(prefix) + addLeadingSlash(p);
            const routeInfo = {
                path: endpointPath,
                method: item.requestMethod,
            };
            const version = item.version ?? controllerVersion;
            if (version && versioningConfig) {
                if (typeof version !== 'string' && Array.isArray(version)) {
                    return version.map(v => ({
                        ...routeInfo,
                        version: toUndefinedIfNeural(v),
                    }));
                }
                routeInfo.version = toUndefinedIfNeural(version);
            }
            return routeInfo;
        });
        return []
            .concat(routePath)
            .map(routePath => controllerPaths
            .map(item => toRouteInfo(item, routePath))
            .reduce(concatPaths, []))
            .reduce(concatPaths, []);
    }
    isRouteInfo(path, objectOrClass) {
        return isUndefined(path);
    }
    normalizeGlobalPath(path) {
        const prefix = addLeadingSlash(path);
        return prefix === '/' ? '' : prefix;
    }
    getRoutePath(route) {
        return Reflect.getMetadata(PATH_METADATA, route);
    }
    getHostModuleOfController(metatype) {
        if (!metatype) {
            return;
        }
        const modulesContainer = this.container.getModules();
        const moduleRefsSet = targetModulesByContainer.get(modulesContainer);
        if (!moduleRefsSet) {
            return;
        }
        const modules = Array.from(modulesContainer.values()).filter(moduleRef => moduleRefsSet.has(moduleRef));
        return modules.find(({ controllers }) => controllers.has(metatype));
    }
    getModulePath(metatype) {
        if (!metatype) {
            return;
        }
        const modulesContainer = this.container.getModules();
        const modulePath = Reflect.getMetadata(MODULE_PATH + modulesContainer.applicationId, metatype);
        return modulePath ?? Reflect.getMetadata(MODULE_PATH, metatype);
    }
    getVersionMetadata(metatype) {
        const versioningConfig = this.applicationConfig.getVersioning();
        if (versioningConfig) {
            return (Reflect.getMetadata(VERSION_METADATA, metatype) ??
                versioningConfig.defaultVersion);
        }
    }
}
