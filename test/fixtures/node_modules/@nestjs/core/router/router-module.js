var RouterModule_1;
import { __decorate, __metadata, __param } from "tslib";
import { Inject, Module } from '@nestjs/common';
import { ModulesContainer } from '../injector/modules-container.js';
import { flattenRoutePaths } from './utils/index.js';
import { MODULE_PATH, normalizePath } from '@nestjs/common/internal';
export const ROUTES = Symbol('ROUTES');
export const targetModulesByContainer = new WeakMap();
/**
 * @publicApi
 */
let RouterModule = RouterModule_1 = class RouterModule {
    modulesContainer;
    routes;
    constructor(modulesContainer, routes) {
        this.modulesContainer = modulesContainer;
        this.routes = routes;
        this.routes = this.deepCloneRoutes(routes);
        this.initialize();
    }
    static register(routes) {
        return {
            module: RouterModule_1,
            providers: [
                {
                    provide: ROUTES,
                    useValue: routes,
                },
            ],
        };
    }
    deepCloneRoutes(routes) {
        return routes.map((routeOrType) => {
            if (typeof routeOrType === 'function') {
                return routeOrType;
            }
            if (routeOrType.children) {
                return {
                    ...routeOrType,
                    children: this.deepCloneRoutes(routeOrType.children),
                };
            }
            return { ...routeOrType };
        });
    }
    initialize() {
        const flattenedRoutes = flattenRoutePaths(this.routes);
        flattenedRoutes.forEach(route => {
            const modulePath = normalizePath(route.path);
            this.registerModulePathMetadata(route.module, modulePath);
            this.updateTargetModulesCache(route.module);
        });
    }
    registerModulePathMetadata(moduleCtor, modulePath) {
        Reflect.defineMetadata(MODULE_PATH + this.modulesContainer.applicationId, modulePath, moduleCtor);
    }
    updateTargetModulesCache(moduleCtor) {
        let moduleClassSet;
        if (targetModulesByContainer.has(this.modulesContainer)) {
            moduleClassSet = targetModulesByContainer.get(this.modulesContainer);
        }
        else {
            moduleClassSet = new WeakSet();
            targetModulesByContainer.set(this.modulesContainer, moduleClassSet);
        }
        const moduleRef = Array.from(this.modulesContainer.values()).find(item => item?.metatype === moduleCtor);
        if (!moduleRef) {
            return;
        }
        moduleClassSet.add(moduleRef);
    }
};
RouterModule = RouterModule_1 = __decorate([
    Module({}),
    __param(1, Inject(ROUTES)),
    __metadata("design:paramtypes", [ModulesContainer, Array])
], RouterModule);
export { RouterModule };
