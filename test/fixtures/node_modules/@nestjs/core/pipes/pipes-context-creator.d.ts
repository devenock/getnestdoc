import { ApplicationConfig } from '../application-config.js';
import { ContextCreator } from '../helpers/context-creator.js';
import { NestContainer } from '../injector/container.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import { type Controller } from '@nestjs/common/internal';
import type { PipeTransform, Type } from '@nestjs/common';
export declare class PipesContextCreator extends ContextCreator {
    private readonly container;
    private readonly config?;
    private moduleContext;
    constructor(container: NestContainer, config?: ApplicationConfig | undefined);
    create(instance: Controller, callback: (...args: unknown[]) => unknown, moduleKey: string, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): PipeTransform[];
    createConcreteContext<T extends any[], R extends any[]>(metadata: T, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): R;
    getPipeInstance(pipe: Function | PipeTransform, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): PipeTransform | null;
    getInstanceByMetatype(metatype: Type<unknown>): InstanceWrapper | undefined;
    getGlobalMetadata<T extends unknown[]>(contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): T;
    setModuleContext(context: string): void;
}
