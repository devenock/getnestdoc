import { InvalidExceptionFilterException } from '../errors/exceptions/invalid-exception-filter.exception.js';
import { BaseExceptionFilter } from './base-exception-filter.js';
import { selectExceptionFilterMetadata, isEmptyArray, } from '@nestjs/common/internal';
export class ExceptionsHandler extends BaseExceptionFilter {
    filters = [];
    next(exception, ctx) {
        if (this.invokeCustomFilters(exception, ctx)) {
            return;
        }
        super.catch(exception, ctx);
    }
    setCustomFilters(filters) {
        if (!Array.isArray(filters)) {
            throw new InvalidExceptionFilterException();
        }
        this.filters = filters;
    }
    invokeCustomFilters(exception, ctx) {
        if (isEmptyArray(this.filters)) {
            return false;
        }
        const filter = selectExceptionFilterMetadata(this.filters, exception);
        filter && filter.func(exception, ctx);
        return !!filter;
    }
}
