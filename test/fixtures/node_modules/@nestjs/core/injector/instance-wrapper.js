import { Logger, Scope, } from '@nestjs/common';
import { clc, isNil, isString, isUndefined, randomStringGenerator, } from '@nestjs/common/internal';
import { iterate } from 'iterare';
import { UuidFactory } from '../inspector/uuid-factory.js';
import { STATIC_CONTEXT } from './constants.js';
import { isClassProvider, isFactoryProvider, isValueProvider, } from './helpers/provider-classifier.js';
export const INSTANCE_METADATA_SYMBOL = Symbol.for('instance_metadata:cache');
export const INSTANCE_ID_SYMBOL = Symbol.for('instance_metadata:id');
const dependencyTreeParents = new WeakMap();
export class InstanceWrapper {
    name;
    token;
    async;
    host;
    isAlias = false;
    subtype;
    scope = Scope.DEFAULT;
    metatype;
    inject;
    forwardRef;
    durable;
    initTime;
    settlementSignal;
    static logger = new Logger(InstanceWrapper.name);
    values = new WeakMap();
    [INSTANCE_METADATA_SYMBOL] = {};
    [INSTANCE_ID_SYMBOL];
    transientMap;
    isTreeStatic;
    isTreeDurable;
    _hierarchyLevel = 0;
    get hierarchyLevel() {
        return this._hierarchyLevel;
    }
    set hierarchyLevel(level) {
        this._hierarchyLevel = level;
    }
    /**
     * The root inquirer reference. Present only if child instance wrapper
     * is transient and has a parent inquirer.
     */
    rootInquirer;
    constructor(metadata = {}) {
        this.initialize(metadata);
        this[INSTANCE_ID_SYMBOL] =
            metadata[INSTANCE_ID_SYMBOL] ?? this.generateUuid();
    }
    get id() {
        return this[INSTANCE_ID_SYMBOL];
    }
    set instance(value) {
        this.values.set(STATIC_CONTEXT, { instance: value });
    }
    get instance() {
        const instancePerContext = this.getInstanceByContextId(STATIC_CONTEXT);
        return instancePerContext.instance;
    }
    get isNotMetatype() {
        return !this.metatype || this.isFactory;
    }
    get isFactory() {
        return !!this.metatype && !isNil(this.inject);
    }
    get isTransient() {
        return this.scope === Scope.TRANSIENT;
    }
    getInstanceByContextId(contextId, inquirerId) {
        if (this.scope === Scope.TRANSIENT && inquirerId) {
            return this.getInstanceByInquirerId(contextId, inquirerId);
        }
        const instancePerContext = this.values.get(contextId);
        return instancePerContext
            ? instancePerContext
            : contextId !== STATIC_CONTEXT
                ? this.cloneStaticInstance(contextId)
                : {
                    instance: null,
                    isResolved: true,
                    isPending: false,
                };
    }
    getInstanceByInquirerId(contextId, inquirerId) {
        let collectionPerContext = this.transientMap.get(inquirerId);
        if (!collectionPerContext) {
            collectionPerContext = new WeakMap();
            this.transientMap.set(inquirerId, collectionPerContext);
        }
        const instancePerContext = collectionPerContext.get(contextId);
        return instancePerContext
            ? instancePerContext
            : this.cloneTransientInstance(contextId, inquirerId);
    }
    setInstanceByContextId(contextId, value, inquirerId) {
        if (this.scope === Scope.TRANSIENT && inquirerId) {
            return this.setInstanceByInquirerId(contextId, inquirerId, value);
        }
        this.values.set(contextId, value);
    }
    setInstanceByInquirerId(contextId, inquirerId, value) {
        let collection = this.transientMap.get(inquirerId);
        if (!collection) {
            collection = new WeakMap();
            this.transientMap.set(inquirerId, collection);
        }
        collection.set(contextId, value);
    }
    removeInstanceByContextId(contextId, inquirerId) {
        if (this.scope === Scope.TRANSIENT && inquirerId) {
            return this.removeInstanceByInquirerId(contextId, inquirerId);
        }
        this.values.delete(contextId);
    }
    removeInstanceByInquirerId(contextId, inquirerId) {
        const collection = this.transientMap.get(inquirerId);
        if (!collection) {
            return;
        }
        collection.delete(contextId);
    }
    addCtorMetadata(index, wrapper) {
        if (!this[INSTANCE_METADATA_SYMBOL].dependencies) {
            this[INSTANCE_METADATA_SYMBOL].dependencies = [];
        }
        this[INSTANCE_METADATA_SYMBOL].dependencies[index] = wrapper;
        this.registerDependencyTreeParent(wrapper);
        this.resetDependencyTreeState();
    }
    getCtorMetadata() {
        return this[INSTANCE_METADATA_SYMBOL].dependencies;
    }
    addPropertiesMetadata(key, wrapper) {
        if (!this[INSTANCE_METADATA_SYMBOL].properties) {
            this[INSTANCE_METADATA_SYMBOL].properties = [];
        }
        this[INSTANCE_METADATA_SYMBOL].properties.push({
            key,
            wrapper,
        });
        this.registerDependencyTreeParent(wrapper);
        this.resetDependencyTreeState();
    }
    getPropertiesMetadata() {
        return this[INSTANCE_METADATA_SYMBOL].properties;
    }
    addEnhancerMetadata(wrapper) {
        if (!this[INSTANCE_METADATA_SYMBOL].enhancers) {
            this[INSTANCE_METADATA_SYMBOL].enhancers = [];
        }
        this[INSTANCE_METADATA_SYMBOL].enhancers.push(wrapper);
        this.registerDependencyTreeParent(wrapper);
        this.resetDependencyTreeState();
    }
    getEnhancersMetadata() {
        return this[INSTANCE_METADATA_SYMBOL].enhancers;
    }
    isDependencyTreeDurable(lookupRegistry = []) {
        if (!isUndefined(this.isTreeDurable)) {
            return this.isTreeDurable;
        }
        if (this.scope === Scope.REQUEST) {
            this.isTreeDurable = this.durable === undefined ? false : this.durable;
            if (this.isTreeDurable) {
                this.printIntrospectedAsDurable();
            }
            return this.isTreeDurable;
        }
        const isStatic = this.isDependencyTreeStatic();
        if (isStatic) {
            return false;
        }
        const isTreeNonDurable = this.introspectDepsAttribute((collection, registry) => collection.some((item) => !item.isDependencyTreeStatic() &&
            !item.isDependencyTreeDurable(registry)), lookupRegistry);
        this.isTreeDurable = !isTreeNonDurable;
        if (this.isTreeDurable) {
            this.printIntrospectedAsDurable();
        }
        return this.isTreeDurable;
    }
    introspectDepsAttribute(callback, lookupRegistry = []) {
        if (lookupRegistry.includes(this[INSTANCE_ID_SYMBOL])) {
            return false;
        }
        lookupRegistry = lookupRegistry.concat(this[INSTANCE_ID_SYMBOL]);
        const { dependencies, properties, enhancers } = this[INSTANCE_METADATA_SYMBOL];
        let introspectionResult = dependencies
            ? callback(dependencies, lookupRegistry)
            : false;
        if (introspectionResult || !(properties || enhancers)) {
            return introspectionResult;
        }
        introspectionResult = properties
            ? callback(properties.map(item => item.wrapper), lookupRegistry)
            : false;
        if (introspectionResult || !enhancers) {
            return introspectionResult;
        }
        return enhancers ? callback(enhancers, lookupRegistry) : false;
    }
    isDependencyTreeStatic(lookupRegistry = []) {
        if (!isUndefined(this.isTreeStatic)) {
            return this.isTreeStatic;
        }
        if (this.scope === Scope.REQUEST) {
            this.isTreeStatic = false;
            this.printIntrospectedAsRequestScoped();
            return this.isTreeStatic;
        }
        this.isTreeStatic = !this.introspectDepsAttribute((collection, registry) => collection.some((item) => !item.isDependencyTreeStatic(registry)), lookupRegistry);
        if (!this.isTreeStatic) {
            this.printIntrospectedAsRequestScoped();
        }
        return this.isTreeStatic;
    }
    cloneStaticInstance(contextId) {
        const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
        if (this.isDependencyTreeStatic()) {
            return staticInstance;
        }
        const instancePerContext = {
            ...staticInstance,
            instance: undefined,
            isResolved: false,
            isPending: false,
        };
        if (this.isNewable()) {
            instancePerContext.instance = Object.create(this.metatype.prototype);
        }
        this.setInstanceByContextId(contextId, instancePerContext);
        return instancePerContext;
    }
    cloneTransientInstance(contextId, inquirerId) {
        const staticInstance = this.getInstanceByContextId(STATIC_CONTEXT);
        const instancePerContext = {
            ...staticInstance,
            instance: undefined,
            isResolved: false,
            isPending: false,
        };
        if (this.isNewable()) {
            instancePerContext.instance = Object.create(this.metatype.prototype);
        }
        this.setInstanceByInquirerId(contextId, inquirerId, instancePerContext);
        return instancePerContext;
    }
    createPrototype(contextId) {
        const host = this.getInstanceByContextId(contextId);
        if (!this.isNewable() || host.isResolved) {
            return;
        }
        return Object.create(this.metatype.prototype);
    }
    isInRequestScope(contextId, inquirer) {
        const isDependencyTreeStatic = this.isDependencyTreeStatic();
        return (!isDependencyTreeStatic &&
            contextId !== STATIC_CONTEXT &&
            (!this.isTransient || (this.isTransient && !!inquirer)));
    }
    isLazyTransient(contextId, inquirer) {
        const isInquirerRequestScoped = !!(inquirer && !inquirer.isDependencyTreeStatic());
        return (this.isDependencyTreeStatic() &&
            contextId !== STATIC_CONTEXT &&
            this.isTransient &&
            isInquirerRequestScoped);
    }
    isExplicitlyRequested(contextId, inquirer) {
        const isSelfRequested = inquirer === this;
        return (this.isDependencyTreeStatic() &&
            contextId !== STATIC_CONTEXT &&
            (isSelfRequested || !!(inquirer && inquirer.scope === Scope.TRANSIENT)));
    }
    isStatic(contextId, inquirer) {
        if (!this.isDependencyTreeStatic() || contextId !== STATIC_CONTEXT) {
            return false;
        }
        // Non-transient provider in static context
        if (!this.isTransient) {
            return true;
        }
        const isInquirerRequestScoped = inquirer && !inquirer.isDependencyTreeStatic();
        const isStaticTransient = this.isTransient && !isInquirerRequestScoped;
        const rootInquirer = inquirer?.getRootInquirer();
        // Transient provider inquired by non-transient (e.g., DEFAULT -> TRANSIENT)
        if (isStaticTransient && inquirer && !inquirer.isTransient) {
            return true;
        }
        // Nested transient with non-transient root (e.g., DEFAULT -> TRANSIENT -> TRANSIENT)
        if (isStaticTransient && rootInquirer && !rootInquirer.isTransient) {
            return true;
        }
        // Nested transient during initial instantiation (rootInquirer not yet set)
        if (isStaticTransient && inquirer?.isTransient && !rootInquirer) {
            return true;
        }
        return false;
    }
    attachRootInquirer(inquirer) {
        if (!this.isTransient) {
            // Only attach root inquirer if the instance wrapper is transient
            return;
        }
        this.rootInquirer = inquirer.getRootInquirer() ?? inquirer;
    }
    getRootInquirer() {
        return this.rootInquirer;
    }
    getStaticTransientInstances() {
        if (!this.transientMap) {
            return [];
        }
        const instances = [...this.transientMap.values()];
        return iterate(instances)
            .map(item => item.get(STATIC_CONTEXT))
            .filter(item => {
            // Only return items where constructor has been actually called
            // This prevents calling lifecycle hooks on non-instantiated transient services
            return !!(item && item.isConstructorCalled);
        })
            .toArray();
    }
    mergeWith(provider) {
        if (isValueProvider(provider)) {
            this.metatype = null;
            this.inject = null;
            this.scope = Scope.DEFAULT;
            this.setInstanceByContextId(STATIC_CONTEXT, {
                instance: provider.useValue,
                isResolved: true,
                isPending: false,
            });
        }
        else if (isClassProvider(provider)) {
            this.inject = null;
            this.metatype = provider.useClass;
        }
        else if (isFactoryProvider(provider)) {
            this.metatype = provider.useFactory;
            this.inject = provider.inject || [];
        }
    }
    isNewable() {
        return isNil(this.inject) && this.metatype && this.metatype.prototype;
    }
    registerDependencyTreeParent(wrapper) {
        if (wrapper instanceof InstanceWrapper) {
            const parents = dependencyTreeParents.get(wrapper) ?? new Set();
            parents.add(this);
            dependencyTreeParents.set(wrapper, parents);
        }
    }
    resetDependencyTreeState(lookupRegistry = new Set()) {
        if (lookupRegistry.has(this[INSTANCE_ID_SYMBOL])) {
            return;
        }
        lookupRegistry.add(this[INSTANCE_ID_SYMBOL]);
        this.isTreeStatic = undefined;
        this.isTreeDurable = undefined;
        dependencyTreeParents
            .get(this)
            ?.forEach(parent => parent.resetDependencyTreeState(lookupRegistry));
    }
    initialize(metadata) {
        const { instance, isResolved, ...wrapperPartial } = metadata;
        Object.assign(this, wrapperPartial);
        this.setInstanceByContextId(STATIC_CONTEXT, {
            instance: instance,
            isResolved,
        });
        this.scope === Scope.TRANSIENT && (this.transientMap = new Map());
    }
    printIntrospectedAsRequestScoped() {
        if (!this.isDebugMode() || this.name === 'REQUEST') {
            return;
        }
        if (isString(this.name)) {
            InstanceWrapper.logger.log(`${clc.cyanBright(this.name)}${clc.green(' introspected as ')}${clc.magentaBright('request-scoped')}`);
        }
    }
    printIntrospectedAsDurable() {
        if (!this.isDebugMode()) {
            return;
        }
        if (isString(this.name)) {
            InstanceWrapper.logger.log(`${clc.cyanBright(this.name)}${clc.green(' introspected as ')}${clc.magentaBright('durable')}`);
        }
    }
    isDebugMode() {
        return !!process.env.NEST_DEBUG;
    }
    generateUuid() {
        let key = this.name?.toString() ?? this.token?.toString();
        key += this.host?.name ?? '';
        return key ? UuidFactory.get(key) : randomStringGenerator();
    }
}
