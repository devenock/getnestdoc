import type { ExecutionContext } from '@nestjs/common';
import type { Type, ContextType } from '@nestjs/common';
import type { HttpArgumentsHost, RpcArgumentsHost, WsArgumentsHost } from '@nestjs/common/internal';
export declare class ExecutionContextHost implements ExecutionContext {
    private readonly args;
    private readonly constructorRef;
    private readonly handler;
    private contextType;
    constructor(args: any[], constructorRef?: Type<any> | null, handler?: Function | null);
    setType<TContext extends string = ContextType>(type: TContext): void;
    getType<TContext extends string = ContextType>(): TContext;
    getClass<T = any>(): Type<T>;
    getHandler(): Function;
    getArgs<T extends Array<any> = any[]>(): T;
    getArgByIndex<T = any>(index: number): T;
    switchToRpc(): RpcArgumentsHost;
    switchToHttp(): HttpArgumentsHost;
    switchToWs(): WsArgumentsHost;
}
