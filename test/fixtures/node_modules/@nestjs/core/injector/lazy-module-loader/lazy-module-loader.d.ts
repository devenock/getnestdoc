import type { DynamicModule, Type } from '@nestjs/common';
import { ModuleOverride } from '../../interfaces/module-override.interface.js';
import { DependenciesScanner } from '../../scanner.js';
import { ModuleCompiler } from '../compiler.js';
import { InstanceLoader } from '../instance-loader.js';
import { ModuleRef } from '../module-ref.js';
import { ModulesContainer } from '../modules-container.js';
import { LazyModuleLoaderLoadOptions } from './lazy-module-loader-options.interface.js';
export declare class LazyModuleLoader {
    private readonly dependenciesScanner;
    private readonly instanceLoader;
    private readonly moduleCompiler;
    private readonly modulesContainer;
    private readonly moduleOverrides?;
    constructor(dependenciesScanner: DependenciesScanner, instanceLoader: InstanceLoader, moduleCompiler: ModuleCompiler, modulesContainer: ModulesContainer, moduleOverrides?: ModuleOverride[] | undefined);
    load(loaderFn: () => Promise<Type<unknown> | DynamicModule> | Type<unknown> | DynamicModule, loadOpts?: LazyModuleLoaderLoadOptions): Promise<ModuleRef>;
    private registerLoggerConfiguration;
    private createLazyModulesContainer;
    private getTargetModuleRef;
}
