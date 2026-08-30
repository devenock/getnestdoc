import { IncomingMessage } from 'http';
import { Observable } from 'rxjs';
import { ContextId } from '../injector/instance-wrapper.js';
import { HeaderStream } from '../router/sse-stream.js';
import { ParamProperties } from './context-utils.js';
import type { Type } from '@nestjs/common';
export declare const HANDLER_METADATA_SYMBOL: unique symbol;
export type HandleResponseFn = HandlerResponseBasicFn | HandleSseResponseFn;
export type HandlerResponseBasicFn = <TResult, TResponse>(result: TResult, res: TResponse, req?: any) => any;
export type HandleSseResponseFn = <TResult extends Observable<unknown> = any, TResponse extends HeaderStream = any, TRequest extends IncomingMessage = any>(result: TResult, res: TResponse, req: TRequest) => any;
export interface HandlerMetadata {
    argsLength: number;
    isSseHandler: boolean;
    paramtypes: any[];
    httpStatusCode: number;
    responseHeaders: any[];
    hasCustomHeaders: boolean;
    getParamsMetadata: (moduleKey: string, contextId?: ContextId, inquirerId?: string) => (ParamProperties & {
        metatype?: any;
    })[];
    fnHandleResponse: HandleResponseFn;
}
export declare class HandlerMetadataStorage<TValue = HandlerMetadata, TKey extends Type<unknown> = any> {
    private readonly [HANDLER_METADATA_SYMBOL];
    set(controller: TKey, methodName: string, metadata: TValue): void;
    get(controller: TKey, methodName: string): TValue | undefined;
    private getMetadataKey;
}
