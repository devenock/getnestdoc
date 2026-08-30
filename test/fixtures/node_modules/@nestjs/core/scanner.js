import { iterate } from 'iterare';
import { ApplicationConfig } from './application-config.js';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE, ENHANCER_TOKEN_TO_SUBTYPE_MAP, } from './constants.js';
import { CircularDependencyException } from './errors/exceptions/circular-dependency.exception.js';
import { InvalidClassModuleException } from './errors/exceptions/invalid-class-module.exception.js';
import { InvalidModuleException } from './errors/exceptions/invalid-module.exception.js';
import { UndefinedModuleException } from './errors/exceptions/undefined-module.exception.js';
import { getClassScope } from './helpers/get-class-scope.js';
import { InternalCoreModuleFactory } from './injector/internal-core-module/internal-core-module-factory.js';
import { TopologyTree } from './injector/topology-tree/topology-tree.js';
import { UuidFactory } from './inspector/uuid-factory.js';
import { CATCH_WATERMARK, CONTROLLER_WATERMARK, ENHANCER_KEY_TO_SUBTYPE_MAP, EXCEPTION_FILTERS_METADATA, GUARDS_METADATA, INJECTABLE_WATERMARK, INTERCEPTORS_METADATA, MODULE_METADATA, PIPES_METADATA, ROUTE_ARGS_METADATA, isFunction, isNil, isUndefined, } from '@nestjs/common/internal';
import { Scope, } from '@nestjs/common';
export class DependenciesScanner {
    container;
    metadataScanner;
    graphInspector;
    applicationConfig;
    applicationProvidersApplyMap = [];
    constructor(container, metadataScanner, graphInspector, applicationConfig = new ApplicationConfig()) {
        this.container = container;
        this.metadataScanner = metadataScanner;
        this.graphInspector = graphInspector;
        this.applicationConfig = applicationConfig;
    }
    async scan(module, options) {
        await this.registerCoreModule(options?.overrides);
        await this.scanForModules({
            moduleDefinition: module,
            overrides: options?.overrides,
        });
        await this.scanModulesForDependencies();
        this.addScopedEnhancersMetadata();
        // Modules distance calculation should be done after all modules are scanned
        // but before global modules are registered (linked to all modules).
        // Global modules have their distance set to MAX anyway.
        this.calculateModulesDistance();
        this.container.bindGlobalScope();
    }
    async scanForModules({ moduleDefinition, lazy, scope = [], ctxRegistry = [], overrides = [], }) {
        const { moduleRef: moduleInstance, inserted: moduleInserted } = (await this.insertOrOverrideModule(moduleDefinition, overrides, scope)) ??
            {};
        if (lazy && !moduleInserted && moduleInstance?.isInstantiated) {
            return [];
        }
        moduleDefinition =
            this.getOverrideModuleByModule(moduleDefinition, overrides)?.newModule ??
                moduleDefinition;
        moduleDefinition =
            moduleDefinition instanceof Promise
                ? await moduleDefinition
                : moduleDefinition;
        ctxRegistry.push(moduleDefinition);
        if (this.isForwardReference(moduleDefinition)) {
            moduleDefinition = moduleDefinition.forwardRef();
        }
        const modules = !this.isDynamicModule(moduleDefinition)
            ? this.reflectMetadata(MODULE_METADATA.IMPORTS, moduleDefinition)
            : [
                ...this.reflectMetadata(MODULE_METADATA.IMPORTS, moduleDefinition.module),
                ...(moduleDefinition.imports || []),
            ];
        let registeredModuleRefs = [];
        for (const [index, innerModule] of modules.entries()) {
            // In case of a circular dependency (ES module system), JavaScript will resolve the type to `undefined`.
            if (innerModule === undefined) {
                throw new UndefinedModuleException(moduleDefinition, index, scope);
            }
            if (!innerModule) {
                throw new InvalidModuleException(moduleDefinition, index, scope, innerModule);
            }
            if (ctxRegistry.includes(innerModule)) {
                continue;
            }
            const moduleRefs = await this.scanForModules({
                moduleDefinition: innerModule,
                scope: [].concat(scope, moduleDefinition),
                ctxRegistry,
                overrides,
                lazy,
            });
            registeredModuleRefs = registeredModuleRefs.concat(moduleRefs);
        }
        if (!moduleInstance) {
            return registeredModuleRefs;
        }
        if (lazy) {
            this.container.bindGlobalsToImports(moduleInstance);
        }
        return [moduleInstance].concat(registeredModuleRefs);
    }
    async insertModule(moduleDefinition, scope) {
        const moduleToAdd = this.isForwardReference(moduleDefinition)
            ? moduleDefinition.forwardRef()
            : moduleDefinition;
        if (this.isInjectable(moduleToAdd)) {
            throw new InvalidClassModuleException(moduleDefinition, scope, 'provider');
        }
        if (this.isController(moduleToAdd)) {
            throw new InvalidClassModuleException(moduleDefinition, scope, 'controller');
        }
        if (this.isExceptionFilter(moduleToAdd)) {
            throw new InvalidClassModuleException(moduleDefinition, scope, 'filter');
        }
        return this.container.addModule(moduleToAdd, scope);
    }
    async scanModulesForDependencies(modules = this.container.getModules()) {
        for (const [token, { metatype }] of modules) {
            await this.reflectImports(metatype, token, metatype.name);
            this.reflectProviders(metatype, token);
            this.reflectControllers(metatype, token);
            this.reflectExports(metatype, token);
        }
    }
    async reflectImports(module, token, context) {
        const modules = [
            ...this.reflectMetadata(MODULE_METADATA.IMPORTS, module),
            ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.IMPORTS),
        ];
        for (const related of modules) {
            await this.insertImport(related, token, context);
        }
    }
    reflectProviders(module, token) {
        const providers = [
            ...this.reflectMetadata(MODULE_METADATA.PROVIDERS, module),
            ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.PROVIDERS),
        ];
        providers.forEach(provider => {
            this.insertProvider(provider, token);
            this.reflectDynamicMetadata(provider, token);
        });
    }
    reflectControllers(module, token) {
        const controllers = [
            ...this.reflectMetadata(MODULE_METADATA.CONTROLLERS, module),
            ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.CONTROLLERS),
        ];
        controllers.forEach(item => {
            this.insertController(item, token);
            this.reflectDynamicMetadata(item, token);
        });
    }
    reflectDynamicMetadata(cls, token) {
        if (!cls || !cls.prototype) {
            return;
        }
        this.reflectInjectables(cls, token, GUARDS_METADATA);
        this.reflectInjectables(cls, token, INTERCEPTORS_METADATA);
        this.reflectInjectables(cls, token, EXCEPTION_FILTERS_METADATA);
        this.reflectInjectables(cls, token, PIPES_METADATA);
        this.reflectParamInjectables(cls, token, ROUTE_ARGS_METADATA);
    }
    reflectExports(module, token) {
        const exports = [
            ...this.reflectMetadata(MODULE_METADATA.EXPORTS, module),
            ...this.container.getDynamicMetadataByToken(token, MODULE_METADATA.EXPORTS),
        ];
        exports.forEach(exportedProvider => this.insertExportedProviderOrModule(exportedProvider, token));
    }
    reflectInjectables(component, token, metadataKey) {
        const controllerInjectables = this.reflectMetadata(metadataKey, component);
        const methodInjectables = this.metadataScanner
            .getAllMethodNames(component.prototype)
            .reduce((acc, method) => {
            const methodInjectable = this.reflectKeyMetadata(component, metadataKey, method);
            if (methodInjectable) {
                acc.push(methodInjectable);
            }
            return acc;
        }, []);
        controllerInjectables.forEach(injectable => this.insertInjectable(injectable, token, component, ENHANCER_KEY_TO_SUBTYPE_MAP[metadataKey]));
        methodInjectables.forEach(methodInjectable => {
            methodInjectable.metadata.forEach(injectable => this.insertInjectable(injectable, token, component, ENHANCER_KEY_TO_SUBTYPE_MAP[metadataKey], methodInjectable.methodKey));
        });
    }
    reflectParamInjectables(component, token, metadataKey) {
        const paramsMethods = this.metadataScanner.getAllMethodNames(component.prototype);
        paramsMethods.forEach(methodKey => {
            const metadata = Reflect.getMetadata(metadataKey, component, methodKey);
            if (!metadata) {
                return;
            }
            const params = Object.values(metadata);
            params
                .map(item => item.pipes)
                .flat(1)
                .forEach(injectable => this.insertInjectable(injectable, token, component, 'pipe', methodKey));
        });
    }
    reflectKeyMetadata(component, key, methodKey) {
        let prototype = component.prototype;
        do {
            const descriptor = Reflect.getOwnPropertyDescriptor(prototype, methodKey);
            if (!descriptor) {
                continue;
            }
            const metadata = Reflect.getMetadata(key, descriptor.value);
            if (!metadata) {
                return;
            }
            return { methodKey, metadata };
        } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
            prototype !== Object.prototype &&
            prototype);
        return undefined;
    }
    calculateModulesDistance() {
        const modulesGenerator = this.container.getModules().values();
        // Skip "InternalCoreModule"
        // The second element is the actual root module
        modulesGenerator.next();
        const rootModule = modulesGenerator.next().value;
        if (!rootModule) {
            return;
        }
        // Convert modules to an acyclic connected graph
        const tree = new TopologyTree(rootModule);
        tree.walk((moduleRef, depth) => {
            if (moduleRef.isGlobal) {
                return;
            }
            moduleRef.distance = depth;
        });
    }
    async insertImport(related, token, context) {
        if (isUndefined(related)) {
            throw new CircularDependencyException(context);
        }
        if (this.isForwardReference(related)) {
            return this.container.addImport(related.forwardRef(), token);
        }
        await this.container.addImport(related, token);
    }
    isCustomProvider(provider) {
        return provider && !isNil(provider.provide);
    }
    insertProvider(provider, token) {
        const isCustomProvider = this.isCustomProvider(provider);
        if (!isCustomProvider) {
            return this.container.addProvider(provider, token);
        }
        const applyProvidersMap = this.getApplyProvidersMap();
        const providersKeys = Object.keys(applyProvidersMap);
        const type = provider.provide;
        if (!providersKeys.includes(type)) {
            return this.container.addProvider(provider, token);
        }
        const uuid = UuidFactory.get(type.toString());
        const providerToken = `${type} (UUID: ${uuid})`;
        let scope = provider.scope;
        if (isNil(scope) && provider.useClass) {
            scope = getClassScope(provider.useClass);
        }
        this.applicationProvidersApplyMap.push({
            type,
            moduleKey: token,
            providerKey: providerToken,
            scope,
        });
        const newProvider = {
            ...provider,
            provide: providerToken,
            scope,
        };
        const enhancerSubtype = ENHANCER_TOKEN_TO_SUBTYPE_MAP[type];
        const factoryOrClassProvider = newProvider;
        if (this.isRequestOrTransient(factoryOrClassProvider.scope)) {
            return this.container.addInjectable(newProvider, token, enhancerSubtype);
        }
        this.container.addProvider(newProvider, token, enhancerSubtype);
    }
    insertInjectable(injectable, token, host, subtype, methodKey) {
        if (isFunction(injectable)) {
            const instanceWrapper = this.container.addInjectable(injectable, token, subtype, host);
            this.graphInspector.insertEnhancerMetadataCache({
                moduleToken: token,
                classRef: host,
                enhancerInstanceWrapper: instanceWrapper,
                targetNodeId: instanceWrapper.id,
                subtype,
                methodKey,
            });
            return instanceWrapper;
        }
        else {
            this.graphInspector.insertEnhancerMetadataCache({
                moduleToken: token,
                classRef: host,
                enhancerRef: injectable,
                methodKey,
                subtype,
            });
        }
    }
    insertExportedProviderOrModule(toExport, token) {
        const fulfilledProvider = this.isForwardReference(toExport)
            ? toExport.forwardRef()
            : toExport;
        this.container.addExportedProviderOrModule(fulfilledProvider, token);
    }
    insertController(controller, token) {
        this.container.addController(controller, token);
    }
    insertOrOverrideModule(moduleDefinition, overrides, scope) {
        const overrideModule = this.getOverrideModuleByModule(moduleDefinition, overrides);
        if (overrideModule !== undefined) {
            return this.overrideModule(moduleDefinition, overrideModule.newModule, scope);
        }
        return this.insertModule(moduleDefinition, scope);
    }
    getOverrideModuleByModule(module, overrides) {
        if (this.isForwardReference(module)) {
            return overrides.find(moduleToOverride => {
                return (moduleToOverride.moduleToReplace === module.forwardRef() ||
                    moduleToOverride.moduleToReplace.forwardRef?.() === module.forwardRef());
            });
        }
        return overrides.find(moduleToOverride => moduleToOverride.moduleToReplace === module);
    }
    async overrideModule(moduleToOverride, newModule, scope) {
        return this.container.replaceModule(this.isForwardReference(moduleToOverride)
            ? moduleToOverride.forwardRef()
            : moduleToOverride, this.isForwardReference(newModule) ? newModule.forwardRef() : newModule, scope);
    }
    reflectMetadata(metadataKey, metatype) {
        return Reflect.getMetadata(metadataKey, metatype) || [];
    }
    async registerCoreModule(overrides) {
        const moduleDefinition = InternalCoreModuleFactory.create(this.container, this, this.container.getModuleCompiler(), this.container.getHttpAdapterHostRef(), this.graphInspector, overrides);
        const [instance] = await this.scanForModules({
            moduleDefinition,
            overrides,
        });
        this.container.registerCoreModuleRef(instance);
    }
    /**
     * Add either request or transient globally scoped enhancers
     * to all controllers metadata storage
     */
    addScopedEnhancersMetadata() {
        iterate(this.applicationProvidersApplyMap)
            .filter(wrapper => this.isRequestOrTransient(wrapper.scope))
            .forEach(({ moduleKey, providerKey }) => {
            const modulesContainer = this.container.getModules();
            const { injectables } = modulesContainer.get(moduleKey);
            const instanceWrapper = injectables.get(providerKey);
            const iterableIterator = modulesContainer.values();
            iterate(iterableIterator)
                .map(moduleRef => Array.from(moduleRef.controllers.values()).concat(moduleRef.entryProviders))
                .flatten()
                .forEach(controllerOrEntryProvider => controllerOrEntryProvider.addEnhancerMetadata(instanceWrapper));
        });
    }
    applyApplicationProviders() {
        const applyProvidersMap = this.getApplyProvidersMap();
        const applyRequestProvidersMap = this.getApplyRequestProvidersMap();
        const getInstanceWrapper = (moduleKey, providerKey, collectionKey) => {
            const modules = this.container.getModules();
            const collection = modules.get(moduleKey)[collectionKey];
            return collection.get(providerKey);
        };
        // Add global enhancers to the application config
        this.applicationProvidersApplyMap.forEach(({ moduleKey, providerKey, type, scope }) => {
            let instanceWrapper;
            if (this.isRequestOrTransient(scope)) {
                instanceWrapper = getInstanceWrapper(moduleKey, providerKey, 'injectables');
                this.graphInspector.insertAttachedEnhancer(instanceWrapper);
                return applyRequestProvidersMap[type](instanceWrapper);
            }
            instanceWrapper = getInstanceWrapper(moduleKey, providerKey, 'providers');
            this.graphInspector.insertAttachedEnhancer(instanceWrapper);
            applyProvidersMap[type](instanceWrapper.instance);
        });
    }
    getApplyProvidersMap() {
        return {
            [APP_INTERCEPTOR]: (interceptor) => this.applicationConfig.addGlobalInterceptor(interceptor),
            [APP_PIPE]: (pipe) => this.applicationConfig.addGlobalPipe(pipe),
            [APP_GUARD]: (guard) => this.applicationConfig.addGlobalGuard(guard),
            [APP_FILTER]: (filter) => this.applicationConfig.addGlobalFilter(filter),
        };
    }
    getApplyRequestProvidersMap() {
        return {
            [APP_INTERCEPTOR]: (interceptor) => this.applicationConfig.addGlobalRequestInterceptor(interceptor),
            [APP_PIPE]: (pipe) => this.applicationConfig.addGlobalRequestPipe(pipe),
            [APP_GUARD]: (guard) => this.applicationConfig.addGlobalRequestGuard(guard),
            [APP_FILTER]: (filter) => this.applicationConfig.addGlobalRequestFilter(filter),
        };
    }
    isDynamicModule(module) {
        return module && !!module.module;
    }
    /**
     * @param metatype
     * @returns `true` if `metatype` is annotated with the `@Injectable()` decorator.
     */
    isInjectable(metatype) {
        return !!Reflect.getMetadata(INJECTABLE_WATERMARK, metatype);
    }
    /**
     * @param metatype
     * @returns `true` if `metatype` is annotated with the `@Controller()` decorator.
     */
    isController(metatype) {
        return !!Reflect.getMetadata(CONTROLLER_WATERMARK, metatype);
    }
    /**
     * @param metatype
     * @returns `true` if `metatype` is annotated with the `@Catch()` decorator.
     */
    isExceptionFilter(metatype) {
        return !!Reflect.getMetadata(CATCH_WATERMARK, metatype);
    }
    isForwardReference(module) {
        return module && !!module.forwardRef;
    }
    isRequestOrTransient(scope) {
        return scope === Scope.REQUEST || scope === Scope.TRANSIENT;
    }
}
