import { type DynamicModule } from '@nestjs/common';
import { Module as ModuleClass } from '../injector/module.js';
import { ModulesContainer } from '../injector/modules-container.js';
import { Routes } from './interfaces/index.js';
export declare const ROUTES: unique symbol;
export declare const targetModulesByContainer: WeakMap<ModulesContainer, WeakSet<ModuleClass>>;
/**
 * @publicApi
 */
export declare class RouterModule {
    private readonly modulesContainer;
    private readonly routes;
    constructor(modulesContainer: ModulesContainer, routes: Routes);
    static register(routes: Routes): DynamicModule;
    private deepCloneRoutes;
    private initialize;
    private registerModulePathMetadata;
    private updateTargetModulesCache;
}
