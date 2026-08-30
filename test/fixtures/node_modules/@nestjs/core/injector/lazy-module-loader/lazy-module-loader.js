import { SilentLogger } from '../helpers/silent-logger.js';
import { ModuleRef } from '../module-ref.js';
export class LazyModuleLoader {
    dependenciesScanner;
    instanceLoader;
    moduleCompiler;
    modulesContainer;
    moduleOverrides;
    constructor(dependenciesScanner, instanceLoader, moduleCompiler, modulesContainer, moduleOverrides) {
        this.dependenciesScanner = dependenciesScanner;
        this.instanceLoader = instanceLoader;
        this.moduleCompiler = moduleCompiler;
        this.modulesContainer = modulesContainer;
        this.moduleOverrides = moduleOverrides;
    }
    async load(loaderFn, loadOpts) {
        this.registerLoggerConfiguration(loadOpts);
        const moduleClassOrDynamicDefinition = await loaderFn();
        const moduleInstances = await this.dependenciesScanner.scanForModules({
            moduleDefinition: moduleClassOrDynamicDefinition,
            overrides: this.moduleOverrides,
            lazy: true,
        });
        if (moduleInstances.length === 0) {
            // The module has been loaded already. In this case, we must
            // retrieve a module reference from the existing container.
            const { token } = await this.moduleCompiler.compile(moduleClassOrDynamicDefinition);
            const moduleInstance = this.modulesContainer.get(token);
            return moduleInstance && this.getTargetModuleRef(moduleInstance);
        }
        const lazyModulesContainer = this.createLazyModulesContainer(moduleInstances);
        await this.dependenciesScanner.scanModulesForDependencies(lazyModulesContainer);
        await this.instanceLoader.createInstancesOfDependencies(lazyModulesContainer);
        const [targetModule] = moduleInstances;
        return this.getTargetModuleRef(targetModule);
    }
    registerLoggerConfiguration(loadOpts) {
        if (loadOpts?.logger === false) {
            this.instanceLoader.setLogger(new SilentLogger());
        }
    }
    createLazyModulesContainer(moduleInstances) {
        moduleInstances = Array.from(new Set(moduleInstances));
        return new Map(moduleInstances.map(ref => [ref.token, ref]));
    }
    getTargetModuleRef(moduleInstance) {
        const moduleRefInstanceWrapper = moduleInstance.getProviderByKey(ModuleRef);
        return moduleRefInstanceWrapper.instance;
    }
}
