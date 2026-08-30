import type { ArgumentMetadata, ContextType, RouteParamMetadata } from '@nestjs/common';
import { type CanActivate, type HttpServer, type ParamData, type PipeTransform, type RequestMethod } from '@nestjs/common';
import { type Controller, RouteParamtypes } from '@nestjs/common/internal';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { GuardsConsumer, GuardsContextCreator } from '../guards/index.js';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import { HandleResponseFn, HandlerMetadata } from '../helpers/handler-metadata-storage.js';
import { InterceptorsConsumer } from '../interceptors/interceptors-consumer.js';
import { InterceptorsContextCreator } from '../interceptors/interceptors-context-creator.js';
import { PipesConsumer } from '../pipes/pipes-consumer.js';
import { PipesContextCreator } from '../pipes/pipes-context-creator.js';
import { IRouteParamsFactory } from './interfaces/route-params-factory.interface.js';
import { CustomHeader, RedirectResponse } from './router-response-controller.js';
export interface ParamProperties {
    index: number;
    type: RouteParamtypes | string;
    data: ParamData;
    pipes: PipeTransform[];
    extractValue: <TRequest, TResponse>(req: TRequest, res: TResponse, next: Function) => any;
    schema?: StandardSchemaV1;
}
export declare class RouterExecutionContext {
    private readonly paramsFactory;
    private readonly pipesContextCreator;
    private readonly pipesConsumer;
    private readonly guardsContextCreator;
    private readonly guardsConsumer;
    private readonly interceptorsContextCreator;
    private readonly interceptorsConsumer;
    readonly applicationRef: HttpServer;
    private readonly handlerMetadataStorage;
    private readonly contextUtils;
    private readonly responseController;
    constructor(paramsFactory: IRouteParamsFactory, pipesContextCreator: PipesContextCreator, pipesConsumer: PipesConsumer, guardsContextCreator: GuardsContextCreator, guardsConsumer: GuardsConsumer, interceptorsContextCreator: InterceptorsContextCreator, interceptorsConsumer: InterceptorsConsumer, applicationRef: HttpServer);
    create(instance: Controller, callback: (...args: any[]) => unknown, methodName: string, moduleKey: string, requestMethod: RequestMethod, contextId?: import("../index.js").ContextId, inquirerId?: string): <TRequest, TResponse>(req: TRequest, res: TResponse, next: Function) => Promise<void>;
    getMetadata<TContext extends ContextType = ContextType>(instance: Controller, callback: (...args: any[]) => any, methodName: string, moduleKey: string, requestMethod: RequestMethod, contextType: TContext): HandlerMetadata;
    reflectRedirect(callback: (...args: unknown[]) => unknown): RedirectResponse;
    reflectHttpStatusCode(callback: (...args: unknown[]) => unknown): number;
    reflectRenderTemplate(callback: (...args: unknown[]) => unknown): string;
    reflectResponseHeaders(callback: (...args: unknown[]) => unknown): CustomHeader[];
    reflectSse(callback: (...args: unknown[]) => unknown): string;
    exchangeKeysForValues(keys: string[], metadata: Record<number, RouteParamMetadata>, moduleContext: string, contextId?: import("../index.js").ContextId, inquirerId?: string, contextFactory?: (args: unknown[]) => ExecutionContextHost): ParamProperties[];
    getParamValue<T>(value: T, metadata: ArgumentMetadata, pipes: PipeTransform[]): Promise<unknown>;
    isPipeable(type: number | string): boolean;
    createGuardsFn<TContext extends string = ContextType>(guards: CanActivate[], instance: Controller, callback: (...args: any[]) => any, contextType?: TContext): ((args: any[]) => Promise<void>) | null;
    createPipesFn(pipes: PipeTransform[], paramsOptions: (ParamProperties & {
        metatype?: any;
    })[]): (<TRequest, TResponse>(args: any[], req: TRequest, res: TResponse, next: Function) => Promise<void>) | null;
    createHandleResponseFn(callback: (...args: unknown[]) => unknown, isResponseHandled: boolean, redirectResponse?: RedirectResponse, httpStatusCode?: number): HandleResponseFn;
    private isResponseHandled;
    private attachSseAbortSignal;
}
