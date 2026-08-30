import type { FactoryProvider, InjectionToken } from '@nestjs/common';
import { type Provider, Scope, type Type } from '@nestjs/common';
import { type EnhancerSubtype } from '@nestjs/common/internal';
import { Module } from './module.js';
import { SettlementSignal } from './settlement-signal.js';
export declare const INSTANCE_METADATA_SYMBOL: unique symbol;
export declare const INSTANCE_ID_SYMBOL: unique symbol;
export interface HostComponentInfo {
    /**
     * Injection token (or class reference)
     */
    token: InjectionToken;
    /**
     * Flag that indicates whether DI subtree is durable
     */
    isTreeDurable: boolean;
}
export interface ContextId {
    readonly id: number;
    payload?: unknown;
    getParent?(info: HostComponentInfo): ContextId;
}
export interface InstancePerContext<T> {
    instance: T;
    isResolved?: boolean;
    isPending?: boolean;
    donePromise?: Promise<unknown>;
    isConstructorCalled?: boolean;
}
export interface PropertyMetadata {
    key: symbol | string;
    wrapper: InstanceWrapper;
}
export declare class InstanceWrapper<T = any> {
    readonly name: any;
    readonly token: InjectionToken;
    readonly async?: boolean;
    readonly host?: Module;
    readonly isAlias: boolean;
    readonly subtype?: EnhancerSubtype;
    scope?: Scope;
    metatype: Type<T> | Function | null;
    inject?: FactoryProvider['inject'] | null;
    forwardRef?: boolean;
    durable?: boolean;
    initTime?: number;
    settlementSignal?: SettlementSignal;
    private static logger;
    private readonly values;
    private readonly [INSTANCE_METADATA_SYMBOL];
    private readonly [INSTANCE_ID_SYMBOL];
    private transientMap?;
    private isTreeStatic;
    private isTreeDurable;
    private _hierarchyLevel;
    get hierarchyLevel(): number;
    set hierarchyLevel(level: number);
    /**
     * The root inquirer reference. Present only if child instance wrapper
     * is transient and has a parent inquirer.
     */
    private rootInquirer;
    constructor(metadata?: Partial<InstanceWrapper<T>> & Partial<InstancePerContext<T>>);
    get id(): string;
    set instance(value: T);
    get instance(): T;
    get isNotMetatype(): boolean;
    get isFactory(): boolean;
    get isTransient(): boolean;
    getInstanceByContextId(contextId: ContextId, inquirerId?: string): InstancePerContext<T>;
    getInstanceByInquirerId(contextId: ContextId, inquirerId: string): InstancePerContext<T>;
    setInstanceByContextId(contextId: ContextId, value: InstancePerContext<T>, inquirerId?: string): void;
    setInstanceByInquirerId(contextId: ContextId, inquirerId: string, value: InstancePerContext<T>): void;
    removeInstanceByContextId(contextId: ContextId, inquirerId?: string): void;
    removeInstanceByInquirerId(contextId: ContextId, inquirerId: string): void;
    addCtorMetadata(index: number, wrapper: InstanceWrapper): void;
    getCtorMetadata(): InstanceWrapper[];
    addPropertiesMetadata(key: symbol | string, wrapper: InstanceWrapper): void;
    getPropertiesMetadata(): PropertyMetadata[];
    addEnhancerMetadata(wrapper: InstanceWrapper): void;
    getEnhancersMetadata(): InstanceWrapper[];
    isDependencyTreeDurable(lookupRegistry?: string[]): boolean;
    introspectDepsAttribute(callback: (collection: InstanceWrapper[], lookupRegistry: string[]) => boolean, lookupRegistry?: string[]): boolean;
    isDependencyTreeStatic(lookupRegistry?: string[]): boolean;
    cloneStaticInstance(contextId: ContextId): InstancePerContext<T>;
    cloneTransientInstance(contextId: ContextId, inquirerId: string): InstancePerContext<T>;
    createPrototype(contextId: ContextId): any;
    isInRequestScope(contextId: ContextId, inquirer?: InstanceWrapper): boolean;
    isLazyTransient(contextId: ContextId, inquirer: InstanceWrapper | undefined): boolean;
    isExplicitlyRequested(contextId: ContextId, inquirer?: InstanceWrapper): boolean;
    isStatic(contextId: ContextId, inquirer: InstanceWrapper | undefined): boolean;
    attachRootInquirer(inquirer: InstanceWrapper): void;
    getRootInquirer(): InstanceWrapper | undefined;
    getStaticTransientInstances(): (InstancePerContext<T> | undefined)[];
    mergeWith(provider: Provider): void;
    private isNewable;
    private registerDependencyTreeParent;
    private resetDependencyTreeState;
    private initialize;
    private printIntrospectedAsRequestScoped;
    private printIntrospectedAsDurable;
    private isDebugMode;
    private generateUuid;
}
