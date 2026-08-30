import type { HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from './base-exception-filter.js';
import { type ExceptionFilterMetadata } from '@nestjs/common/internal';
import type { ArgumentsHost } from '@nestjs/common';
export declare class ExceptionsHandler extends BaseExceptionFilter {
    private filters;
    next(exception: Error | HttpException, ctx: ArgumentsHost): void;
    setCustomFilters(filters: ExceptionFilterMetadata[]): void;
    invokeCustomFilters<T = any>(exception: T, ctx: ArgumentsHost): boolean;
}
