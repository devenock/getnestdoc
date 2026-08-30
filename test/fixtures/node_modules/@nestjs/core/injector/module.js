import { iterate } from 'iterare';
import { ApplicationConfig } from '../application-config.js';
import { InvalidClassException, RuntimeException, UnknownExportException, } from '../errors/exceptions/index.js';
import { createContextId } from '../helpers/context-id-factory.js';
import { getClassScope } from '../helpers/get-class-scope.js';
import { isDurable } from '../helpers/is-durable.js';
import { makeSafeInstanceDecorator } from '../helpers/safe-instance-decorator.js';
import { UuidFactory } from '../inspector/uuid-factory.js';
import { CONTROLLER_ID_KEY } from './constants.js';
import { InstanceWrapper } from './instance-wrapper.js';
import { ModuleRef } from './module-ref.js';
import { ENTRY_PROVIDER_WATERMARK, randomStringGenerator, isFunction, isNil, isObject, isString, isSymbol, isUndefined, } from '@nestjs/common/internal';
import { Scope, } from '@nestjs/common';
export class Module {
    _metatype;
    container;
    _id;
    _imports = new Set();
    _providers = new Map();
    _injectables = new Map();
    _middlewares = new Map();
    _controllers = new Map();
    _entryProviderKeys = new Set();
    _exports = new Set();
    _distance = 0;
    _initOnPreview = false;
    _isGlobal = false;
    _token;
    constructor(_metatype, container) {
        this._metatype = _metatype;
        this.container = container;
        this.addCoreProviders();
        this._id = this.generateUuid();
    }
    get id() {
        return this._id;
    }
    get token() {
        return this._token;
    }
    set token(token) {
        this._token = token;
    }
    get name() {
        return this.metatype.name;
    }
    get isGlobal() {
        return this._isGlobal;
    }
    set isGlobal(global) {
        this._isGlobal = global;
    }
    get initOnPreview() {
        return this._initOnPreview;
    }
    set initOnPreview(initOnPreview) {
        this._initOnPreview = initOnPreview;
    }
    get providers() {
        return this._providers;
    }
    get middlewares() {
        return this._middlewares;
    }
    get imports() {
        return this._imports;
    }
    get injectables() {
        return this._injectables;
    }
    get controllers() {
        return this._controllers;
    }
    get entryProviders() {
        return Array.from(this._entryProviderKeys).map(token => this.providers.get(token));
    }
    get exports() {
        return this._exports;
    }
    get instance() {
        if (!this._providers.has(this._metatype)) {
            throw new RuntimeException();
        }
        const moduleRef = this._providers.get(this._metatype);
        return moduleRef.instance;
    }
    /**
     * Modules are registered in the container before they are scanned (dynamic
     * `imports` are pre-registered by `NestContainer#addDynamicMetadata`), so
     * registration alone does not imply the module was ever instantiated.
     */
    get isInstantiated() {
        return !isNil(this._providers.get(this._metatype)?.instance);
    }
    get metatype() {
        return this._metatype;
    }
    get distance() {
        return this._distance;
    }
    set distance(value) {
        this._distance = value;
    }
    addCoreProviders() {
        this.addModuleAsProvider();
        this.addModuleRef();
        this.addApplicationConfig();
    }
    addModuleRef() {
        const moduleRef = this.createModuleReferenceType();
        this._providers.set(ModuleRef, new InstanceWrapper({
            token: ModuleRef,
            name: ModuleRef.name,
            metatype: ModuleRef,
            isResolved: true,
            instance: new moduleRef(),
            host: this,
        }));
    }
    addModuleAsProvider() {
        this._providers.set(this._metatype, new InstanceWrapper({
            token: this._metatype,
            name: this._metatype.name,
            metatype: this._metatype,
            isResolved: false,
            instance: null,
            host: this,
        }));
    }
    addApplicationConfig() {
        this._providers.set(ApplicationConfig, new InstanceWrapper({
            token: ApplicationConfig,
            name: ApplicationConfig.name,
            isResolved: true,
            instance: this.container.applicationConfig,
            host: this,
        }));
    }
    addInjectable(injectable, enhancerSubtype, host) {
        if (this.isCustomProvider(injectable)) {
            return this.addCustomProvider(injectable, this._injectables, enhancerSubtype);
        }
        let instanceWrapper = this.injectables.get(injectable);
        if (!instanceWrapper) {
            instanceWrapper = new InstanceWrapper({
                token: injectable,
                name: injectable.name,
                metatype: injectable,
                instance: null,
                isResolved: false,
                scope: getClassScope(injectable),
                durable: isDurable(injectable),
                subtype: enhancerSubtype,
                host: this,
            });
            this._injectables.set(injectable, instanceWrapper);
        }
        if (host) {
            const hostWrapper = this._controllers.get(host) || this._providers.get(host);
            hostWrapper && hostWrapper.addEnhancerMetadata(instanceWrapper);
        }
        return instanceWrapper;
    }
    addProvider(provider, enhancerSubtype) {
        if (this.isCustomProvider(provider)) {
            if (this.isEntryProvider(provider.provide)) {
                this._entryProviderKeys.add(provider.provide);
            }
            return this.addCustomProvider(provider, this._providers, enhancerSubtype);
        }
        const isAlreadyDeclared = this._providers.has(provider);
        if ((this.isTransientProvider(provider) ||
            this.isRequestScopeProvider(provider)) &&
            isAlreadyDeclared) {
            return provider;
        }
        this._providers.set(provider, new InstanceWrapper({
            token: provider,
            name: provider.name,
            metatype: provider,
            instance: null,
            isResolved: false,
            scope: getClassScope(provider),
            durable: isDurable(provider),
            host: this,
        }));
        if (this.isEntryProvider(provider)) {
            this._entryProviderKeys.add(provider);
        }
        return provider;
    }
    isCustomProvider(provider) {
        return !isNil(provider.provide);
    }
    addCustomProvider(provider, collection, enhancerSubtype) {
        if (this.isCustomClass(provider)) {
            this.addCustomClass(provider, collection, enhancerSubtype);
        }
        else if (this.isCustomValue(provider)) {
            this.addCustomValue(provider, collection, enhancerSubtype);
        }
        else if (this.isCustomFactory(provider)) {
            this.addCustomFactory(provider, collection, enhancerSubtype);
        }
        else if (this.isCustomUseExisting(provider)) {
            this.addCustomUseExisting(provider, collection, enhancerSubtype);
        }
        return provider.provide;
    }
    isCustomClass(provider) {
        return !isUndefined(provider.useClass);
    }
    isCustomValue(provider) {
        return (isObject(provider) &&
            Object.prototype.hasOwnProperty.call(provider, 'useValue'));
    }
    isCustomFactory(provider) {
        return !isUndefined(provider.useFactory);
    }
    isCustomUseExisting(provider) {
        return !isUndefined(provider.useExisting);
    }
    isDynamicModule(exported) {
        return exported && exported.module;
    }
    addCustomClass(provider, collection, enhancerSubtype) {
        let { scope, durable } = provider;
        const { useClass } = provider;
        if (isUndefined(scope)) {
            scope = getClassScope(useClass);
        }
        if (isUndefined(durable)) {
            durable = isDurable(useClass);
        }
        const token = provider.provide;
        collection.set(token, new InstanceWrapper({
            token,
            name: useClass?.name || useClass,
            metatype: useClass,
            instance: null,
            isResolved: false,
            scope,
            durable,
            host: this,
            subtype: enhancerSubtype,
        }));
    }
    addCustomValue(provider, collection, enhancerSubtype) {
        const { useValue: value, provide: providerToken } = provider;
        const instanceDecorator = this.container.contextOptions?.instrument?.instanceDecorator;
        collection.set(providerToken, new InstanceWrapper({
            token: providerToken,
            name: providerToken?.name || providerToken,
            metatype: null,
            instance: instanceDecorator
                ? makeSafeInstanceDecorator(instanceDecorator)(value)
                : value,
            isResolved: true,
            async: value instanceof Promise,
            host: this,
            subtype: enhancerSubtype,
        }));
    }
    addCustomFactory(provider, collection, enhancerSubtype) {
        const { useFactory: factory, inject, scope, durable, provide: providerToken, } = provider;
        collection.set(providerToken, new InstanceWrapper({
            token: providerToken,
            name: providerToken?.name || providerToken,
            metatype: factory,
            instance: null,
            isResolved: false,
            inject: inject || [],
            scope,
            durable,
            host: this,
            subtype: enhancerSubtype,
        }));
    }
    addCustomUseExisting(provider, collection, enhancerSubtype) {
        const { useExisting, provide: providerToken } = provider;
        collection.set(providerToken, new InstanceWrapper({
            token: providerToken,
            name: providerToken?.name || providerToken,
            metatype: (instance => instance),
            instance: null,
            isResolved: false,
            inject: [useExisting],
            host: this,
            isAlias: true,
            subtype: enhancerSubtype,
        }));
    }
    addExportedProviderOrModule(toExport) {
        const addExportedUnit = (token) => this._exports.add(this.validateExportedProvider(token));
        if (this.isCustomProvider(toExport)) {
            return this.addCustomExportedProvider(toExport);
        }
        else if (isString(toExport) || isSymbol(toExport)) {
            return addExportedUnit(toExport);
        }
        else if (this.isDynamicModule(toExport)) {
            const { module: moduleClassRef } = toExport;
            return addExportedUnit(moduleClassRef);
        }
        addExportedUnit(toExport);
    }
    addCustomExportedProvider(provider) {
        const provide = provider.provide;
        if (isString(provide) || isSymbol(provide)) {
            return this._exports.add(this.validateExportedProvider(provide));
        }
        this._exports.add(this.validateExportedProvider(provide));
    }
    validateExportedProvider(token) {
        if (this._providers.has(token)) {
            return token;
        }
        const imports = iterate(this._imports.values())
            .filter(item => !!item)
            .map(({ metatype }) => metatype)
            .filter(metatype => !!metatype)
            .toArray();
        if (!imports.includes(token)) {
            const { name } = this.metatype;
            const providerName = isFunction(token) ? token.name : token;
            throw new UnknownExportException(providerName, name);
        }
        return token;
    }
    addController(controller) {
        this._controllers.set(controller, new InstanceWrapper({
            token: controller,
            name: controller.name,
            metatype: controller,
            instance: null,
            isResolved: false,
            scope: getClassScope(controller),
            durable: isDurable(controller),
            host: this,
        }));
        this.assignControllerUniqueId(controller);
    }
    assignControllerUniqueId(controller) {
        Object.defineProperty(controller, CONTROLLER_ID_KEY, {
            enumerable: false,
            writable: false,
            configurable: true,
            value: randomStringGenerator(),
        });
    }
    addImport(moduleRef) {
        this._imports.add(moduleRef);
    }
    replace(toReplace, options) {
        if (options.isProvider && this.hasProvider(toReplace)) {
            const originalProvider = this._providers.get(toReplace);
            return originalProvider.mergeWith({ provide: toReplace, ...options });
        }
        else if (!options.isProvider && this.hasInjectable(toReplace)) {
            const originalInjectable = this._injectables.get(toReplace);
            return originalInjectable.mergeWith({
                provide: toReplace,
                ...options,
            });
        }
    }
    hasProvider(token) {
        return this._providers.has(token);
    }
    hasInjectable(token) {
        return this._injectables.has(token);
    }
    getProviderByKey(name) {
        return this._providers.get(name);
    }
    getProviderById(id) {
        for (const item of this._providers.values()) {
            if (item.id === id)
                return item;
        }
        return undefined;
    }
    getControllerById(id) {
        for (const item of this._controllers.values()) {
            if (item.id === id)
                return item;
        }
        return undefined;
    }
    getInjectableById(id) {
        for (const item of this._injectables.values()) {
            if (item.id === id)
                return item;
        }
        return undefined;
    }
    getMiddlewareById(id) {
        for (const item of this._middlewares.values()) {
            if (item.id === id)
                return item;
        }
        return undefined;
    }
    getNonAliasProviders() {
        return [...this._providers].filter(([_, wrapper]) => !wrapper.isAlias);
    }
    createModuleReferenceType() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        return class extends ModuleRef {
            constructor() {
                super(self.container);
            }
            get(typeOrToken, options = {}) {
                options.strict ??= true;
                options.each ??= false;
                return this.find(typeOrToken, options.strict
                    ? {
                        moduleId: self.id,
                        each: options.each,
                    }
                    : options);
            }
            resolve(typeOrToken, contextId = createContextId(), options = {}) {
                options.strict ??= true;
                options.each ??= false;
                return this.resolvePerContext(typeOrToken, self, contextId, options);
            }
            async create(type, contextId) {
                if (!(type && isFunction(type) && type.prototype)) {
                    throw new InvalidClassException(type);
                }
                return this.instantiateClass(type, self, contextId);
            }
        };
    }
    isEntryProvider(metatype) {
        return typeof metatype === 'function'
            ? !!Reflect.getMetadata(ENTRY_PROVIDER_WATERMARK, metatype)
            : false;
    }
    generateUuid() {
        const prefix = 'M_';
        const key = this.token
            ? this.token.includes(':')
                ? this.token.split(':')[1]
                : this.token
            : this.name;
        return key ? UuidFactory.get(`${prefix}_${key}`) : randomStringGenerator();
    }
    isTransientProvider(provider) {
        return getClassScope(provider) === Scope.TRANSIENT;
    }
    isRequestScopeProvider(provider) {
        return getClassScope(provider) === Scope.REQUEST;
    }
}
