import type { NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import type { ContextType } from '@nestjs/common';
import { type Controller } from '@nestjs/common/internal';
export declare class InterceptorsConsumer {
    intercept<TContext extends string = ContextType>(interceptors: NestInterceptor[], args: unknown[], instance: Controller, callback: (...args: unknown[]) => unknown, next: () => Promise<unknown>, type?: TContext): Promise<unknown>;
    createContext(args: unknown[], instance: Controller, callback: (...args: unknown[]) => unknown): ExecutionContextHost;
    transformDeferred(next: () => Promise<any>): Observable<any>;
}
