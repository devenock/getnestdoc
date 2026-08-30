import { ExternalExceptionsHandler } from '../exceptions/external-exceptions-handler.js';
import type { ContextType } from '@nestjs/common';
export declare class ExternalErrorProxy {
    createProxy<TContext extends string = ContextType>(targetCallback: (...args: any[]) => any, exceptionsHandler: ExternalExceptionsHandler, type?: TContext): (...args: any[]) => Promise<any>;
}
