import { type Abstract, type Type } from '@nestjs/common';
import { Injector } from './injector.js';
import { InstanceLinksHost } from './instance-links-host.js';
import { ContextId } from './instance-wrapper.js';
import { Module } from './module.js';
import type { GetOrResolveOptions } from '@nestjs/common/internal';
export declare abstract class AbstractInstanceResolver {
    protected abstract instanceLinksHost: InstanceLinksHost;
    protected abstract injector: Injector;
    protected abstract get<TInput = any, TResult = TInput>(typeOrToken: Type<TInput> | Function | string | symbol, options?: GetOrResolveOptions): TResult | Array<TResult>;
    protected find<TInput = any, TResult = TInput>(typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol, options: {
        moduleId?: string;
        each?: boolean;
    }): TResult | Array<TResult>;
    protected resolvePerContext<TInput = any, TResult = TInput>(typeOrToken: Type<TInput> | Abstract<TInput> | string | symbol, contextModule: Module, contextId: ContextId, options?: GetOrResolveOptions): Promise<TResult | Array<TResult>>;
}
