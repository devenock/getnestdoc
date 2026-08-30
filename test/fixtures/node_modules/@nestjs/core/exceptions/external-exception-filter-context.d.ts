import { ApplicationConfig } from '../application-config.js';
import { NestContainer } from '../injector/container.js';
import { RouterProxyCallback } from '../router/router-proxy.js';
import { BaseExceptionFilterContext } from './base-exception-filter-context.js';
import { ExternalExceptionsHandler } from './external-exceptions-handler.js';
import { type Controller } from '@nestjs/common/internal';
export declare class ExternalExceptionFilterContext extends BaseExceptionFilterContext {
    private readonly config?;
    constructor(container: NestContainer, config?: ApplicationConfig | undefined);
    create(instance: Controller, callback: RouterProxyCallback, module: string, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): ExternalExceptionsHandler;
    getGlobalMetadata<T extends any[]>(contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): T;
}
