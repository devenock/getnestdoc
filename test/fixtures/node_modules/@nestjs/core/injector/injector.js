import { Logger, Scope, } from '@nestjs/common';
import { OPTIONAL_DEPS_METADATA, OPTIONAL_PROPERTY_DEPS_METADATA, PARAMTYPES_METADATA, PROPERTY_DEPS_METADATA, SELF_DECLARED_DEPS_METADATA, clc, isFunction, isNil, isObject, isString, isSymbol, isUndefined, } from '@nestjs/common/internal';
import { iterate } from 'iterare';
import { performance } from 'perf_hooks';
import { CircularDependencyException } from '../errors/exceptions/index.js';
import { RuntimeException } from '../errors/exceptions/runtime.exception.js';
import { UndefinedDependencyException } from '../errors/exceptions/undefined-dependency.exception.js';
import { UnknownDependenciesException } from '../errors/exceptions/unknown-dependencies.exception.js';
import { Barrier } from '../helpers/barrier.js';
import { makeSafeInstanceDecorator } from '../helpers/safe-instance-decorator.js';
import { STATIC_CONTEXT } from './constants.js';
import { INQUIRER } from './inquirer/index.js';
import { InstanceWrapper, } from './instance-wrapper.js';
import { SettlementSignal } from './settlement-signal.js';
export class Injector {
    options;
    logger = new Logger('InjectorLogger');
    instanceDecorator = (target) => target;
    constructor(options) {
        this.options = options;
        if (options?.instanceDecorator) {
            this.instanceDecorator = makeSafeInstanceDecorator(options.instanceDecorator);
        }
    }
    loadPrototype({ token }, collection, contextId = STATIC_CONTEXT) {
        if (!collection) {
            return;
        }
        const target = collection.get(token);
        const instance = target.createPrototype(contextId);
        if (instance) {
            const wrapper = new InstanceWrapper({
                ...target,
                instance,
            });
            collection.set(token, wrapper);
        }
    }
    async loadInstance(wrapper, collection, moduleRef, resolutionContext = { contextId: STATIC_CONTEXT }) {
        const inquirerId = this.getContextInquirerId(resolutionContext);
        const instanceHost = wrapper.getInstanceByContextId(this.getContextId(resolutionContext.contextId, wrapper), inquirerId);
        if (instanceHost.isPending) {
            const settlementSignal = wrapper.settlementSignal;
            if (resolutionContext.inquirer &&
                settlementSignal?.isCycle(resolutionContext.inquirer.id)) {
                throw new CircularDependencyException(`"${wrapper.name}"`);
            }
            return instanceHost.donePromise.then((err) => {
                if (err) {
                    throw err;
                }
            });
        }
        const settlementSignal = this.applySettlementSignal(instanceHost, wrapper);
        const token = wrapper.token || wrapper.name;
        const { inject } = wrapper;
        const targetWrapper = collection.get(token);
        if (isUndefined(targetWrapper)) {
            throw new RuntimeException();
        }
        if (instanceHost.isResolved) {
            return settlementSignal.complete();
        }
        try {
            const t0 = this.getNowTimestamp();
            const localResolutionContext = this.createResolutionContext(resolutionContext.contextId, wrapper, inquirerId);
            const callback = async (instances, depth = 0) => {
                const properties = await this.resolveProperties(wrapper, moduleRef, inject, localResolutionContext, resolutionContext.inquirer);
                const instance = await this.instantiateClass(instances, wrapper, targetWrapper, wrapper.isTransient ? localResolutionContext : resolutionContext);
                this.applyProperties(instance, properties);
                wrapper.hierarchyLevel = depth + 1;
                wrapper.initTime = this.getNowTimestamp() - t0;
                settlementSignal.complete();
            };
            await this.resolveConstructorParams(wrapper, moduleRef, inject, callback, localResolutionContext, resolutionContext.inquirer);
            if (!instanceHost.isResolved) {
                settlementSignal.complete();
            }
        }
        catch (err) {
            wrapper.removeInstanceByContextId(this.getContextId(resolutionContext.contextId, wrapper), inquirerId);
            settlementSignal.error(err);
            throw err;
        }
    }
    async loadMiddleware(wrapper, collection, moduleRef, contextId = STATIC_CONTEXT, inquirer) {
        const { metatype, token } = wrapper;
        const targetWrapper = collection.get(token);
        if (!isUndefined(targetWrapper.instance)) {
            return;
        }
        targetWrapper.instance = Object.create(metatype.prototype);
        await this.loadInstance(wrapper, collection, moduleRef, this.createResolutionContext(contextId, inquirer || wrapper));
    }
    async loadController(wrapper, moduleRef, contextId = STATIC_CONTEXT) {
        const controllers = moduleRef.controllers;
        await this.loadInstance(wrapper, controllers, moduleRef, this.createResolutionContext(contextId, wrapper));
        await this.loadEnhancersPerContext(wrapper, contextId, wrapper);
    }
    async loadInjectable(wrapper, moduleRef, contextId = STATIC_CONTEXT, inquirer) {
        const injectables = moduleRef.injectables;
        await this.loadInstance(wrapper, injectables, moduleRef, this.createResolutionContext(contextId, inquirer));
    }
    async loadProvider(wrapper, moduleRef, resolutionContext = { contextId: STATIC_CONTEXT }) {
        if (this.shouldSkipProviderLoading(wrapper, resolutionContext)) {
            return;
        }
        const providers = moduleRef.providers;
        await this.loadInstance(wrapper, providers, moduleRef, resolutionContext);
        await this.loadEnhancersPerContext(wrapper, resolutionContext.contextId, wrapper);
    }
    applySettlementSignal(instancePerContext, host) {
        const settlementSignal = new SettlementSignal();
        instancePerContext.donePromise = settlementSignal.asPromise();
        instancePerContext.isPending = true;
        host.settlementSignal = settlementSignal;
        return settlementSignal;
    }
    async resolveConstructorParams(wrapper, moduleRef, inject, callback, resolutionContext = { contextId: STATIC_CONTEXT }, parentInquirer) {
        const metadata = wrapper.getCtorMetadata();
        if (resolutionContext.contextId !== STATIC_CONTEXT &&
            this.hasDenseCtorMetadata(wrapper, inject, metadata)) {
            const deps = await this.loadCtorMetadata(metadata, resolutionContext.contextId, resolutionContext.inquirer, parentInquirer);
            return callback(deps);
        }
        const isFactoryProvider = !isNil(inject);
        const [dependencies, optionalDependenciesIds] = isFactoryProvider
            ? this.getFactoryProviderDependencies(wrapper)
            : this.getClassDependencies(wrapper);
        const paramBarrier = new Barrier(dependencies.length);
        let isResolved = true;
        let depth = 0;
        const resolveParam = async (param, index) => {
            try {
                if (this.isInquirer(param, parentInquirer)) {
                    /*
                     * Signal the barrier to make sure other dependencies do not get stuck waiting forever.
                     */
                    paramBarrier.signal();
                    return parentInquirer && parentInquirer.instance;
                }
                if (resolutionContext.inquirer?.isTransient && parentInquirer) {
                    // When `inquirer` is transient too, inherit the parent inquirer
                    // This is required to ensure that transient providers are only resolved
                    // when requested
                    resolutionContext.inquirer.attachRootInquirer(parentInquirer);
                }
                const nestedResolutionContext = this.getStaticTransientResolutionContext(resolutionContext, parentInquirer);
                const paramWrapper = await this.resolveSingleParam(wrapper, param, { index, dependencies }, moduleRef, nestedResolutionContext, index);
                /*
                 * Ensure that all instance wrappers are resolved at this point before we continue.
                 * Otherwise the staticity of `wrapper`'s dependency tree may be evaluated incorrectly
                 * and result in undefined / null injection.
                 */
                await paramBarrier.signalAndWait();
                const effectiveResolutionContext = this.getEffectiveResolutionContext(paramWrapper, resolutionContext, parentInquirer);
                const paramWrapperWithInstance = await this.resolveComponentHost(moduleRef, paramWrapper, effectiveResolutionContext);
                if (paramWrapperWithInstance.hierarchyLevel > depth) {
                    depth = paramWrapperWithInstance.hierarchyLevel;
                }
                const instanceHost = paramWrapperWithInstance.getInstanceByContextId(this.getContextId(effectiveResolutionContext.contextId, paramWrapperWithInstance), effectiveResolutionContext.effectiveInquirerId);
                if (!instanceHost.isResolved && !paramWrapperWithInstance.forwardRef) {
                    isResolved = false;
                }
                return instanceHost?.instance;
            }
            catch (err) {
                /*
                 * Signal the barrier to make sure other dependencies do not get stuck waiting forever. We
                 * do not care if this occurs after `Barrier.signalAndWait()` is called in the `try` block
                 * because the barrier will always have been resolved by then.
                 */
                paramBarrier.signal();
                const isOptional = optionalDependenciesIds.includes(index);
                if (!isOptional) {
                    throw err;
                }
                return undefined;
            }
        };
        const instances = await Promise.all(dependencies.map(resolveParam));
        isResolved && (await callback(instances, depth));
    }
    getClassDependencies(wrapper) {
        const ctorRef = wrapper.metatype;
        return [
            this.reflectConstructorParams(ctorRef),
            this.reflectOptionalParams(ctorRef),
        ];
    }
    getFactoryProviderDependencies(wrapper) {
        const optionalDependenciesIds = [];
        /**
         * Same as the internal utility function `isOptionalFactoryDependency` from `@nestjs/common`.
         * We are duplicating it here because that one is not supposed to be exported.
         */
        function isOptionalFactoryDependency(value) {
            return (!isUndefined(value.token) &&
                !isUndefined(value.optional) &&
                !value.prototype);
        }
        const mapFactoryProviderInjectArray = (item, index) => {
            if (typeof item !== 'object') {
                return item;
            }
            if (isOptionalFactoryDependency(item)) {
                if (item.optional) {
                    optionalDependenciesIds.push(index);
                }
                return item?.token;
            }
            return item;
        };
        return [
            wrapper.inject?.map?.(mapFactoryProviderInjectArray),
            optionalDependenciesIds,
        ];
    }
    reflectConstructorParams(type) {
        const paramtypes = [
            ...(Reflect.getMetadata(PARAMTYPES_METADATA, type) || []),
        ];
        const selfParams = this.reflectSelfParams(type);
        selfParams.forEach(({ index, param }) => (paramtypes[index] = param));
        return Array.from(paramtypes);
    }
    reflectOptionalParams(type) {
        return Reflect.getOwnMetadata(OPTIONAL_DEPS_METADATA, type) || [];
    }
    reflectSelfParams(type) {
        return Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, type) || [];
    }
    async resolveSingleParam(wrapper, param, dependencyContext, moduleRef, resolutionContext = { contextId: STATIC_CONTEXT }, keyOrIndex) {
        if (isUndefined(param)) {
            this.logger.log('Nest encountered an undefined dependency. This may be due to a circular import or a missing dependency declaration.');
            throw new UndefinedDependencyException(wrapper.name, dependencyContext, moduleRef);
        }
        const token = this.resolveParamToken(wrapper, param);
        return this.resolveComponentWrapper(moduleRef, token, dependencyContext, wrapper, resolutionContext, keyOrIndex);
    }
    resolveParamToken(wrapper, param) {
        if (typeof param === 'object' && 'forwardRef' in param) {
            wrapper.forwardRef = true;
            return param.forwardRef();
        }
        return param;
    }
    async resolveComponentWrapper(moduleRef, token, dependencyContext, wrapper, resolutionContext = { contextId: STATIC_CONTEXT }, keyOrIndex) {
        this.printResolvingDependenciesLog(token, resolutionContext.inquirer);
        this.printLookingForProviderLog(token, moduleRef);
        const providers = moduleRef.providers;
        return this.lookupComponent(providers, moduleRef, { ...dependencyContext, name: token }, wrapper, resolutionContext, keyOrIndex);
    }
    async resolveComponentHost(moduleRef, instanceWrapper, resolutionContext = { contextId: STATIC_CONTEXT }) {
        const inquirerId = this.getContextInquirerId(resolutionContext);
        const instanceHost = instanceWrapper.getInstanceByContextId(this.getContextId(resolutionContext.contextId, instanceWrapper), inquirerId);
        if (!instanceHost.isResolved && !instanceWrapper.forwardRef) {
            resolutionContext.inquirer?.settlementSignal?.insertRef(instanceWrapper.id);
            await this.loadProvider(instanceWrapper, instanceWrapper.host ?? moduleRef, resolutionContext);
        }
        else if (!instanceHost.isResolved &&
            instanceWrapper.forwardRef &&
            (resolutionContext.contextId !== STATIC_CONTEXT || !!inquirerId)) {
            /**
             * When circular dependency has been detected between
             * either request/transient providers, we have to asynchronously
             * resolve instance host for a specific contextId or inquirer, to ensure
             * that eventual lazily created instance will be merged with the prototype
             * instantiated beforehand.
             */
            if (instanceHost.donePromise) {
                void instanceHost.donePromise
                    .then(() => this.loadProvider(instanceWrapper, moduleRef, resolutionContext))
                    .catch(err => {
                    instanceWrapper.settlementSignal?.error(err);
                });
            }
            else {
                /**
                 * No load has ever been scheduled for this context (e.g., request-scoped
                 * providers are no longer instantiated during static bootstrap, so a fresh
                 * durable/request sub-tree host has no inherited `donePromise`).
                 * Load it now; if a circular dependency is truly in-flight, the nested
                 * lookup will find this host pending and defer through its `donePromise`.
                 */
                await this.loadProvider(instanceWrapper, instanceWrapper.host ?? moduleRef, resolutionContext);
            }
        }
        if (instanceWrapper.async) {
            const host = instanceWrapper.getInstanceByContextId(this.getContextId(resolutionContext.contextId, instanceWrapper), inquirerId);
            host.instance = await host.instance;
            instanceWrapper.setInstanceByContextId(resolutionContext.contextId, host, inquirerId);
        }
        return instanceWrapper;
    }
    async lookupComponent(providers, moduleRef, dependencyContext, wrapper, resolutionContext = { contextId: STATIC_CONTEXT }, keyOrIndex) {
        const token = wrapper.token || wrapper.name;
        const { name } = dependencyContext;
        if (wrapper && token === name) {
            throw new UnknownDependenciesException(wrapper.name, dependencyContext, moduleRef, { id: wrapper.id });
        }
        if (name && providers.has(name)) {
            const instanceWrapper = providers.get(name);
            this.printFoundInModuleLog(name, moduleRef);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapper);
            return instanceWrapper;
        }
        return this.lookupComponentInParentModules(dependencyContext, moduleRef, wrapper, resolutionContext, keyOrIndex);
    }
    async lookupComponentInParentModules(dependencyContext, moduleRef, wrapper, resolutionContext = { contextId: STATIC_CONTEXT }, keyOrIndex) {
        const instanceWrapper = await this.lookupComponentInImports(moduleRef, dependencyContext.name, wrapper, new Set(), resolutionContext, keyOrIndex);
        if (isNil(instanceWrapper)) {
            throw new UnknownDependenciesException(wrapper.name, dependencyContext, moduleRef, { id: wrapper.id });
        }
        return instanceWrapper;
    }
    async lookupComponentInImports(moduleRef, name, wrapper, moduleRegistry = new Set(), resolutionContext = { contextId: STATIC_CONTEXT }, keyOrIndex, isTraversing) {
        let instanceWrapperRef = null;
        const imports = moduleRef.imports || new Set();
        const identity = (item) => item;
        let children = [...imports.values()].filter(identity);
        if (isTraversing) {
            const contextModuleExports = moduleRef.exports;
            children = children.filter(child => contextModuleExports.has(child.metatype));
        }
        for (const relatedModule of children) {
            if (moduleRegistry.has(relatedModule.id)) {
                continue;
            }
            this.printLookingForProviderLog(name, relatedModule);
            moduleRegistry.add(relatedModule.id);
            const { providers, exports } = relatedModule;
            if (!exports.has(name) || !providers.has(name)) {
                const instanceRef = await this.lookupComponentInImports(relatedModule, name, wrapper, moduleRegistry, resolutionContext, keyOrIndex, true);
                if (instanceRef) {
                    this.addDependencyMetadata(keyOrIndex, wrapper, instanceRef);
                    return instanceRef;
                }
                continue;
            }
            this.printFoundInModuleLog(name, relatedModule);
            instanceWrapperRef = providers.get(name);
            this.addDependencyMetadata(keyOrIndex, wrapper, instanceWrapperRef);
            /*
             * Stop at the first direct export match. Continuing when the provider is
             * already resolved would let a later import (e.g. a global forRoot module)
             * override an explicit forFeature import for the same token.
             */
            break;
        }
        return instanceWrapperRef;
    }
    async resolveProperties(wrapper, moduleRef, inject, resolutionContext = { contextId: STATIC_CONTEXT }, parentInquirer) {
        if (!isNil(inject)) {
            return [];
        }
        const metadata = wrapper.getPropertiesMetadata();
        if (metadata && resolutionContext.contextId !== STATIC_CONTEXT) {
            return this.loadPropertiesMetadata(metadata, resolutionContext.contextId, resolutionContext.inquirer);
        }
        const properties = this.reflectProperties(wrapper.metatype);
        const propertyBarrier = new Barrier(properties.length);
        const instances = await Promise.all(properties.map(async (item) => {
            try {
                const dependencyContext = {
                    key: item.key,
                    name: item.name,
                };
                if (this.isInquirer(item.name, parentInquirer)) {
                    /*
                     * Signal the barrier to make sure other dependencies do not get stuck waiting forever.
                     */
                    propertyBarrier.signal();
                    return parentInquirer && parentInquirer.instance;
                }
                const nestedResolutionContext = this.getStaticTransientResolutionContext(resolutionContext, parentInquirer);
                const paramWrapper = await this.resolveSingleParam(wrapper, item.name, dependencyContext, moduleRef, nestedResolutionContext, item.key);
                /*
                 * Ensure that all instance wrappers are resolved at this point before we continue.
                 * Otherwise the staticity of `wrapper`'s dependency tree may be evaluated incorrectly
                 * and result in undefined / null injection.
                 */
                await propertyBarrier.signalAndWait();
                const effectivePropertyResolutionContext = this.getEffectiveResolutionContext(paramWrapper, resolutionContext, parentInquirer);
                const paramWrapperWithInstance = await this.resolveComponentHost(moduleRef, paramWrapper, effectivePropertyResolutionContext);
                if (!paramWrapperWithInstance) {
                    return undefined;
                }
                const instanceHost = paramWrapperWithInstance.getInstanceByContextId(this.getContextId(effectivePropertyResolutionContext.contextId, paramWrapperWithInstance), effectivePropertyResolutionContext.effectiveInquirerId);
                return instanceHost.instance;
            }
            catch (err) {
                /*
                 * Signal the barrier to make sure other dependencies do not get stuck waiting forever. We
                 * do not care if this occurs after `Barrier.signalAndWait()` is called in the `try` block
                 * because the barrier will always have been resolved by then.
                 */
                propertyBarrier.signal();
                if (!item.isOptional) {
                    throw err;
                }
                return undefined;
            }
        }));
        return properties.map((item, index) => ({
            ...item,
            instance: instances[index],
        }));
    }
    reflectProperties(type) {
        const properties = Reflect.getMetadata(PROPERTY_DEPS_METADATA, type) || [];
        const optionalKeys = Reflect.getMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, type) || [];
        return properties.map((item) => ({
            ...item,
            name: item.type,
            isOptional: optionalKeys.includes(item.key),
        }));
    }
    applyProperties(instance, properties) {
        if (!isObject(instance)) {
            return;
        }
        iterate(properties)
            .filter(item => !isNil(item.instance))
            .forEach(item => (instance[item.key] = item.instance));
    }
    async instantiateClass(instances, wrapper, targetMetatype, resolutionContext = { contextId: STATIC_CONTEXT }) {
        const { metatype, inject } = wrapper;
        const inquirerId = this.getContextInquirerId(resolutionContext);
        const instanceHost = targetMetatype.getInstanceByContextId(this.getContextId(resolutionContext.contextId, targetMetatype), inquirerId);
        const isInContext = this.isInContext(wrapper, resolutionContext);
        if (this.options?.preview && !wrapper.host?.initOnPreview) {
            instanceHost.isResolved = true;
            return instanceHost.instance;
        }
        if (isNil(inject) && isInContext) {
            instanceHost.instance = wrapper.forwardRef
                ? Object.assign(instanceHost.instance, new metatype(...instances))
                : new metatype(...instances);
            instanceHost.instance = this.instanceDecorator(instanceHost.instance);
            instanceHost.isConstructorCalled = true;
        }
        else if (isInContext) {
            const factoryReturnValue = targetMetatype.metatype(...instances);
            instanceHost.instance = await factoryReturnValue;
            instanceHost.instance = this.instanceDecorator(instanceHost.instance);
            instanceHost.isConstructorCalled = true;
        }
        instanceHost.isResolved = true;
        return instanceHost.instance;
    }
    async loadPerContext(instance, moduleRef, collection, ctx, wrapper) {
        if (!wrapper) {
            const injectionToken = instance.constructor;
            wrapper = collection.get(injectionToken);
        }
        else {
            wrapper = collection.get(wrapper.token) ?? wrapper;
        }
        await this.loadInstance(wrapper, collection, moduleRef, this.createResolutionContext(ctx, wrapper));
        await this.loadEnhancersPerContext(wrapper, ctx, wrapper);
        const host = wrapper.getInstanceByContextId(this.getContextId(ctx, wrapper), wrapper.id);
        return host && host.instance;
    }
    async loadEnhancersPerContext(wrapper, ctx, inquirer) {
        if (ctx === STATIC_CONTEXT) {
            return;
        }
        const enhancers = wrapper.getEnhancersMetadata() || [];
        const loadEnhancer = (item) => {
            const hostModule = item.host;
            return this.loadInstance(item, hostModule.injectables, hostModule, this.createResolutionContext(ctx, inquirer));
        };
        await Promise.all(enhancers.map(loadEnhancer));
    }
    async loadCtorMetadata(metadata, contextId, inquirer, parentInquirer) {
        const hosts = await Promise.all(metadata.map(async (item) => this.resolveScopedComponentHost(item, contextId, inquirer, parentInquirer)));
        return hosts.map((item, index) => {
            const dependency = metadata[index];
            const effectiveInquirerId = this.getEffectiveInquirerId(dependency, this.createResolutionContext(contextId, inquirer), parentInquirer);
            return item?.getInstanceByContextId(this.getContextId(contextId, item), effectiveInquirerId).instance;
        });
    }
    async loadPropertiesMetadata(metadata, contextId, inquirer) {
        const dependenciesHosts = await Promise.all(metadata.map(async ({ wrapper: item, key }) => ({
            key,
            host: await this.resolveComponentHost(item.host, item, this.createResolutionContext(contextId, inquirer)),
        })));
        const inquirerId = this.getInquirerId(inquirer);
        return dependenciesHosts.map(({ key, host }) => ({
            key,
            name: key,
            instance: host.getInstanceByContextId(this.getContextId(contextId, host), inquirerId).instance,
        }));
    }
    getInquirerId(inquirer) {
        return inquirer ? inquirer.id : undefined;
    }
    createResolutionContext(contextId, inquirer, effectiveInquirerId) {
        return {
            contextId,
            inquirer,
            effectiveInquirerId,
        };
    }
    getContextInquirerId({ inquirer, effectiveInquirerId, }) {
        return effectiveInquirerId ?? this.getInquirerId(inquirer);
    }
    isInContext(wrapper, resolutionContext) {
        return (wrapper.isStatic(resolutionContext.contextId, resolutionContext.inquirer) ||
            wrapper.isInRequestScope(resolutionContext.contextId, resolutionContext.inquirer) ||
            wrapper.isLazyTransient(resolutionContext.contextId, resolutionContext.inquirer) ||
            wrapper.isExplicitlyRequested(resolutionContext.contextId, resolutionContext.inquirer));
    }
    shouldSkipProviderLoading(wrapper, resolutionContext) {
        const isStaticContext = resolutionContext.contextId === STATIC_CONTEXT;
        const hasNoInquirer = !resolutionContext.inquirer;
        const isTopLevelStaticTransientOrRequestProvider = hasNoInquirer && (wrapper.isTransient || wrapper.scope === Scope.REQUEST);
        const isStaticInquirerOutsideResolutionContext = !!resolutionContext.inquirer &&
            !this.isInContext(resolutionContext.inquirer, this.createResolutionContext(resolutionContext.contextId, resolutionContext.inquirer));
        const shouldSkipForStaticBootstrap = isStaticContext &&
            (isTopLevelStaticTransientOrRequestProvider ||
                isStaticInquirerOutsideResolutionContext);
        return shouldSkipForStaticBootstrap;
    }
    /**
     * For nested TRANSIENT dependencies (TRANSIENT -> TRANSIENT) in non-static contexts,
     * returns parentInquirer to ensure each parent TRANSIENT gets its own instance.
     * This is necessary because in REQUEST/DURABLE scopes, the same TRANSIENT wrapper
     * can be used by multiple parents, causing nested TRANSIENTs to be shared incorrectly.
     * For non-TRANSIENT -> TRANSIENT, returns inquirer (current wrapper being created).
     */
    getEffectiveInquirer(dependency, resolutionContext, parentInquirer) {
        const { inquirer, contextId } = resolutionContext;
        if (dependency?.isTransient && inquirer?.isTransient && parentInquirer) {
            if (contextId === STATIC_CONTEXT) {
                return inquirer.getRootInquirer() ?? parentInquirer;
            }
            return parentInquirer;
        }
        return inquirer;
    }
    getEffectiveInquirerId(dependency, resolutionContext, parentInquirer) {
        const { contextId, inquirer, effectiveInquirerId } = resolutionContext;
        if (contextId === STATIC_CONTEXT &&
            dependency?.isTransient &&
            inquirer?.isTransient &&
            parentInquirer) {
            const baseInquirerId = effectiveInquirerId ?? this.getInquirerId(parentInquirer);
            return `${baseInquirerId}:${inquirer.id}`;
        }
        const effectiveInquirer = this.getEffectiveInquirer(dependency, resolutionContext, parentInquirer);
        return this.getInquirerId(effectiveInquirer);
    }
    getStaticTransientResolutionContext(resolutionContext, parentInquirer) {
        const { contextId, inquirer, effectiveInquirerId } = resolutionContext;
        if (contextId === STATIC_CONTEXT &&
            inquirer?.isTransient &&
            parentInquirer) {
            const baseInquirerId = effectiveInquirerId ?? this.getInquirerId(parentInquirer);
            return this.createResolutionContext(contextId, inquirer, `${baseInquirerId}:${inquirer.id}`);
        }
        return resolutionContext;
    }
    getEffectiveResolutionContext(dependency, resolutionContext, parentInquirer) {
        return this.createResolutionContext(resolutionContext.contextId, this.getEffectiveInquirer(dependency, resolutionContext, parentInquirer), this.getEffectiveInquirerId(dependency, resolutionContext, parentInquirer));
    }
    hasDenseCtorMetadata(wrapper, inject, metadata) {
        if (!metadata) {
            return false;
        }
        // The fast path requires a fully populated metadata array.
        // While another request is still registering dependency metadata,
        // sparse entries here would feed request-scoped factories `undefined`.
        const expectedDepsLength = !isNil(inject)
            ? inject.length
            : wrapper.metatype
                ? this.reflectConstructorParams(wrapper.metatype).length
                : 0;
        if (metadata.length !== expectedDepsLength) {
            return false;
        }
        for (let index = 0; index < expectedDepsLength; index++) {
            if (metadata[index] === undefined) {
                return false;
            }
        }
        return true;
    }
    resolveScopedComponentHost(item, contextId, inquirer, parentInquirer) {
        return this.isInquirerRequest(item, parentInquirer)
            ? parentInquirer
            : this.resolveComponentHost(item.host, item, this.getEffectiveResolutionContext(item, this.createResolutionContext(contextId, inquirer), parentInquirer));
    }
    isInquirerRequest(item, parentInquirer) {
        return item.isTransient && item.name === INQUIRER && parentInquirer;
    }
    isInquirer(param, parentInquirer) {
        return param === INQUIRER && parentInquirer;
    }
    addDependencyMetadata(keyOrIndex, hostWrapper, instanceWrapper) {
        if (isSymbol(keyOrIndex) || isString(keyOrIndex)) {
            hostWrapper.addPropertiesMetadata(keyOrIndex, instanceWrapper);
        }
        else {
            hostWrapper.addCtorMetadata(keyOrIndex, instanceWrapper);
        }
    }
    getTokenName(token) {
        return isFunction(token) ? token.name : token.toString();
    }
    printResolvingDependenciesLog(token, inquirer) {
        if (!this.isDebugMode()) {
            return;
        }
        const tokenName = this.getTokenName(token);
        const dependentName = (inquirer?.name && inquirer.name.toString?.()) ?? 'unknown';
        const isAlias = dependentName === tokenName;
        const messageToPrint = `Resolving dependency ${clc.cyanBright(tokenName)}${clc.green(' in the ')}${clc.yellow(dependentName)}${clc.green(` provider ${isAlias ? '(alias)' : ''}`)}`;
        this.logger.log(messageToPrint);
    }
    printLookingForProviderLog(token, moduleRef) {
        if (!this.isDebugMode()) {
            return;
        }
        const tokenName = this.getTokenName(token);
        const moduleRefName = moduleRef?.metatype?.name ?? 'unknown';
        this.logger.log(`Looking for ${clc.cyanBright(tokenName)}${clc.green(' in ')}${clc.magentaBright(moduleRefName)}`);
    }
    printFoundInModuleLog(token, moduleRef) {
        if (!this.isDebugMode()) {
            return;
        }
        const tokenName = this.getTokenName(token);
        const moduleRefName = moduleRef?.metatype?.name ?? 'unknown';
        this.logger.log(`Found ${clc.cyanBright(tokenName)}${clc.green(' in ')}${clc.magentaBright(moduleRefName)}`);
    }
    isDebugMode() {
        return !!process.env.NEST_DEBUG;
    }
    getContextId(contextId, instanceWrapper) {
        return contextId.getParent
            ? contextId.getParent({
                token: instanceWrapper.token,
                isTreeDurable: instanceWrapper.isDependencyTreeDurable(),
            })
            : contextId;
    }
    getNowTimestamp() {
        return performance.now();
    }
}
