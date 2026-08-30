import { ContextCreator } from '../helpers/context-creator.js';
import { NestContainer } from '../injector/container.js';
import { InstanceWrapper } from '../injector/instance-wrapper.js';
import type { Type, ExceptionFilter } from '@nestjs/common';
export declare class BaseExceptionFilterContext extends ContextCreator {
    private readonly container;
    protected moduleContext: string;
    constructor(container: NestContainer);
    createConcreteContext<T extends any[], R extends any[]>(metadata: T, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): R;
    getFilterInstance(filter: Function | ExceptionFilter, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): ExceptionFilter | null;
    getInstanceByMetatype(metatype: Type<unknown>): InstanceWrapper | undefined;
    reflectCatchExceptions(instance: ExceptionFilter): Type<any>[];
}
