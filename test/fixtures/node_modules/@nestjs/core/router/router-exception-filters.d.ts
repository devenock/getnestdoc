import type { HttpServer } from '@nestjs/common';
import { ApplicationConfig } from '../application-config.js';
import { BaseExceptionFilterContext } from '../exceptions/base-exception-filter-context.js';
import { ExceptionsHandler } from '../exceptions/exceptions-handler.js';
import { NestContainer } from '../injector/container.js';
import { RouterProxyCallback } from './router-proxy.js';
import { type Controller } from '@nestjs/common/internal';
export declare class RouterExceptionFilters extends BaseExceptionFilterContext {
    private readonly config;
    private readonly applicationRef;
    constructor(container: NestContainer, config: ApplicationConfig, applicationRef: HttpServer);
    create(instance: Controller, callback: RouterProxyCallback, moduleKey: string | undefined, contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): ExceptionsHandler;
    getGlobalMetadata<T extends unknown[]>(contextId?: import("../injector/instance-wrapper.js").ContextId, inquirerId?: string): T;
}
