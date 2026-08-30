import type { CanActivate } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import type { ContextType } from '@nestjs/common';
import { type Controller } from '@nestjs/common/internal';
export declare class GuardsConsumer {
    tryActivate<TContext extends string = ContextType>(guards: CanActivate[], args: unknown[], instance: Controller, callback: (...args: unknown[]) => unknown, type?: TContext): Promise<boolean>;
    createContext(args: unknown[], instance: Controller, callback: (...args: unknown[]) => unknown): ExecutionContextHost;
    pickResult(result: boolean | Promise<boolean> | Observable<boolean>): Promise<boolean>;
}
