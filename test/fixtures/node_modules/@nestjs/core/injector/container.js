import { DiscoverableMetaHostCollection } from '../discovery/discoverable-meta-host-collection.js';
import { CircularDependencyException, UndefinedForwardRefException, UnknownModuleException, } from '../errors/exceptions/index.js';
import { InitializeOnPreviewAllowlist } from '../inspector/initialize-on-preview.allowlist.js';
import { SerializedGraph } from '../inspector/serialized-graph.js';
import { REQUEST } from '../router/request/request-constants.js';
import { ModuleCompiler } from './compiler.js';
import { InternalCoreModule } from './internal-core-module/internal-core-module.js';
import { InternalProvidersStorage } from './internal-providers-storage.js';
import { Module } from './module.js';
import { ModulesContainer } from './modules-container.js';
import { ByReferenceModuleOpaqueKeyFactory } from './opaque-key-factory/by-reference-module-opaque-key-factory.js';
import { DeepHashedModuleOpaqueKeyFactory } from './opaque-key-factory/deep-hashed-module-opaque-key-factory.js';
import { GLOBAL_MODULE_METADATA, } from '@nestjs/common/internal';
export class NestContainer {
    _applicationConfig;
    _contextOptions;
    globalModules = new Set();
    modules = new ModulesContainer();
    dynamicModulesMetadata = new Map();
    internalProvidersStorage = new InternalProvidersStorage();
    _serializedGraph = new SerializedGraph();
    moduleCompiler;
    internalCoreModule;
    constructor(_applicationConfig = undefined, _contextOptions = undefined) {
        this._applicationConfig = _applicationConfig;
        this._contextOptions = _contextOptions;
        const moduleOpaqueKeyFactory = this._contextOptions?.moduleIdGeneratorAlgorithm === 'deep-hash'
            ? new DeepHashedModuleOpaqueKeyFactory()
            : new ByReferenceModuleOpaqueKeyFactory({
                keyGenerationStrategy: this._contextOptions?.snapshot
                    ? 'shallow'
                    : 'random',
            });
        this.moduleCompiler = new ModuleCompiler(moduleOpaqueKeyFactory);
    }
    get serializedGraph() {
        return this._serializedGraph;
    }
    get applicationConfig() {
        return this._applicationConfig;
    }
    get contextOptions() {
        return this._contextOptions;
    }
    setHttpAdapter(httpAdapter) {
        this.internalProvidersStorage.httpAdapter = httpAdapter;
        if (!this.internalProvidersStorage.httpAdapterHost) {
            return;
        }
        const host = this.internalProvidersStorage.httpAdapterHost;
        host.httpAdapter = httpAdapter;
    }
    getHttpAdapterRef() {
        return this.internalProvidersStorage.httpAdapter;
    }
    getHttpAdapterHostRef() {
        return this.internalProvidersStorage.httpAdapterHost;
    }
    async addModule(metatype, scope) {
        // In DependenciesScanner#scanForModules we already check for undefined or invalid modules
        // We still need to catch the edge-case of `forwardRef(() => undefined)`
        if (!metatype) {
            throw new UndefinedForwardRefException(scope);
        }
        const { type, dynamicMetadata, token } = await this.moduleCompiler.compile(metatype);
        if (this.modules.has(token)) {
            return {
                moduleRef: this.modules.get(token),
                inserted: false,
            };
        }
        return {
            moduleRef: await this.setModule({
                token,
                type,
                dynamicMetadata,
            }, scope),
            inserted: true,
        };
    }
    async replaceModule(metatypeToReplace, newMetatype, scope) {
        // In DependenciesScanner#scanForModules we already check for undefined or invalid modules
        // We still need to catch the edge-case of `forwardRef(() => undefined)`
        if (!metatypeToReplace || !newMetatype) {
            throw new UndefinedForwardRefException(scope);
        }
        const { token } = await this.moduleCompiler.compile(metatypeToReplace);
        const { type, dynamicMetadata } = await this.moduleCompiler.compile(newMetatype);
        return {
            moduleRef: await this.setModule({
                token,
                type,
                dynamicMetadata,
            }, scope),
            inserted: true,
        };
    }
    async setModule({ token, dynamicMetadata, type }, scope) {
        const moduleRef = new Module(type, this);
        moduleRef.token = token;
        moduleRef.initOnPreview = this.shouldInitOnPreview(type);
        this.modules.set(token, moduleRef);
        const updatedScope = [].concat(scope, type);
        await this.addDynamicMetadata(token, dynamicMetadata, updatedScope);
        if (this.isGlobalModule(type, dynamicMetadata)) {
            moduleRef.isGlobal = true;
            // Set global module distance to MAX_VALUE to ensure their lifecycle hooks
            // are always executed first (when initializing the application)
            moduleRef.distance = Number.MAX_VALUE;
            this.addGlobalModule(moduleRef);
        }
        return moduleRef;
    }
    async addDynamicMetadata(token, dynamicModuleMetadata, scope) {
        if (!dynamicModuleMetadata) {
            return;
        }
        this.dynamicModulesMetadata.set(token, dynamicModuleMetadata);
        const { imports } = dynamicModuleMetadata;
        await this.addDynamicModules(imports, scope);
    }
    async addDynamicModules(modules, scope) {
        if (!modules) {
            return;
        }
        await Promise.all(modules.map(module => this.addModule(module, scope)));
    }
    isGlobalModule(metatype, dynamicMetadata) {
        if (dynamicMetadata && dynamicMetadata.global) {
            return true;
        }
        return !!Reflect.getMetadata(GLOBAL_MODULE_METADATA, metatype);
    }
    addGlobalModule(module) {
        this.globalModules.add(module);
    }
    getModules() {
        return this.modules;
    }
    getModuleCompiler() {
        return this.moduleCompiler;
    }
    getModuleByKey(moduleKey) {
        return this.modules.get(moduleKey);
    }
    getInternalCoreModuleRef() {
        return this.internalCoreModule;
    }
    async addImport(relatedModule, token) {
        if (!this.modules.has(token)) {
            return;
        }
        const moduleRef = this.modules.get(token);
        const { token: relatedModuleToken } = await this.moduleCompiler.compile(relatedModule);
        const related = this.modules.get(relatedModuleToken);
        moduleRef.addImport(related);
    }
    addProvider(provider, token, enhancerSubtype) {
        const moduleRef = this.modules.get(token);
        if (!provider) {
            throw new CircularDependencyException(moduleRef?.metatype.name);
        }
        if (!moduleRef) {
            throw new UnknownModuleException();
        }
        const providerKey = moduleRef.addProvider(provider, enhancerSubtype);
        const providerRef = moduleRef.getProviderByKey(providerKey);
        DiscoverableMetaHostCollection.inspectProvider(this.modules, providerRef);
        return providerKey;
    }
    addInjectable(injectable, token, enhancerSubtype, host) {
        if (!this.modules.has(token)) {
            throw new UnknownModuleException();
        }
        const moduleRef = this.modules.get(token);
        return moduleRef.addInjectable(injectable, enhancerSubtype, host);
    }
    addExportedProviderOrModule(toExport, token) {
        if (!this.modules.has(token)) {
            throw new UnknownModuleException();
        }
        const moduleRef = this.modules.get(token);
        moduleRef.addExportedProviderOrModule(toExport);
    }
    addController(controller, token) {
        if (!this.modules.has(token)) {
            throw new UnknownModuleException();
        }
        const moduleRef = this.modules.get(token);
        moduleRef.addController(controller);
        const controllerRef = moduleRef.controllers.get(controller);
        DiscoverableMetaHostCollection.inspectController(this.modules, controllerRef);
    }
    clear() {
        this.modules.clear();
    }
    replace(toReplace, options) {
        this.modules.forEach(moduleRef => moduleRef.replace(toReplace, options));
    }
    bindGlobalScope() {
        this.modules.forEach(moduleRef => this.bindGlobalsToImports(moduleRef));
    }
    bindGlobalsToImports(moduleRef) {
        this.globalModules.forEach(globalModule => this.bindGlobalModuleToModule(moduleRef, globalModule));
    }
    bindGlobalModuleToModule(target, globalModule) {
        if (target === globalModule || target === this.internalCoreModule) {
            return;
        }
        target.addImport(globalModule);
    }
    getDynamicMetadataByToken(token, metadataKey) {
        const metadata = this.dynamicModulesMetadata.get(token);
        return metadataKey ? (metadata?.[metadataKey] ?? []) : metadata;
    }
    registerCoreModuleRef(moduleRef) {
        this.internalCoreModule = moduleRef;
        this.modules[InternalCoreModule.name] = moduleRef;
    }
    getModuleTokenFactory() {
        return this.moduleCompiler.moduleOpaqueKeyFactory;
    }
    registerRequestProvider(request, contextId) {
        const wrapper = this.internalCoreModule.getProviderByKey(REQUEST);
        wrapper.setInstanceByContextId(contextId, {
            instance: request,
            isResolved: true,
        });
    }
    shouldInitOnPreview(type) {
        return InitializeOnPreviewAllowlist.has(type);
    }
}
