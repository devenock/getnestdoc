import { ExternalExceptionFilter } from './external-exception-filter.js';
import { type ExceptionFilterMetadata } from '@nestjs/common/internal';
import type { ArgumentsHost } from '@nestjs/common';
export declare class ExternalExceptionsHandler extends ExternalExceptionFilter {
    private filters;
    next(exception: Error, host: ArgumentsHost): Promise<any>;
    setCustomFilters(filters: ExceptionFilterMetadata[]): void;
    invokeCustomFilters<T = any>(exception: T, host: ArgumentsHost): Promise<any> | null;
}
