import type { CanActivate } from '@nestjs/common';
import { ApplicationConfig } from '../application-config.js';
import { ContextCreator } from '../helpers/context-creator.js';
import { NestContainer } from '../injector/container.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import { type Controller } from '@nestjs/common/internal';
import type { Type } from '@nestjs/common';
export declare class GuardsContextCreator extends ContextCreator {
    private readonly container;
    private readonly config?;
    private moduleContext;
    constructor(container: NestContainer, config?: ApplicationConfig | undefined);
    create(instance: Controller, callback: (...args: unknown[]) => unknown, module: string, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): CanActivate[];
    createConcreteContext<T extends unknown[], R extends unknown[]>(metadata: T, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): R;
    getGuardInstance(metatype: Function | CanActivate, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): CanActivate | null;
    getInstanceByMetatype(metatype: Type<unknown>): InstanceWrapper | undefined;
    getGlobalMetadata<T extends unknown[]>(contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): T;
}
