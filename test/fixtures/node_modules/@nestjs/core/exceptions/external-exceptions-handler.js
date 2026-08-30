import { InvalidExceptionFilterException } from '../errors/exceptions/invalid-exception-filter.exception.js';
import { ExternalExceptionFilter } from './external-exception-filter.js';
import { selectExceptionFilterMetadata, isEmptyArray, } from '@nestjs/common/internal';
export class ExternalExceptionsHandler extends ExternalExceptionFilter {
    filters = [];
    next(exception, host) {
        const result = this.invokeCustomFilters(exception, host);
        if (result) {
            return result;
        }
        return super.catch(exception, host);
    }
    setCustomFilters(filters) {
        if (!Array.isArray(filters)) {
            throw new InvalidExceptionFilterException();
        }
        this.filters = filters;
    }
    invokeCustomFilters(exception, host) {
        if (isEmptyArray(this.filters)) {
            return null;
        }
        const filter = selectExceptionFilterMetadata(this.filters, exception);
        return filter ? filter.func(exception, host) : null;
    }
}
