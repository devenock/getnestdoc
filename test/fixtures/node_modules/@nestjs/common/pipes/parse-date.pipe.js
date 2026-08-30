import { __decorate, __metadata } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil, isNumber, isString } from '../utils/shared.utils.js';
/**
 * @publicApi
 */
let ParseDatePipe = class ParseDatePipe {
    options;
    exceptionFactory;
    constructor(options = {}) {
        this.options = options;
        const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST } = options;
        this.exceptionFactory =
            exceptionFactory ||
                (error => new HttpErrorByCode[errorHttpStatusCode](error));
    }
    /**
     * Method that accesses and performs optional transformation on argument for
     * in-flight requests.
     *
     * @param value currently processed route argument
     * @param metadata contains metadata about the currently processed route argument
     */
    transform(value) {
        if (this.options.optional && isNil(value)) {
            return this.options.default ? this.options.default() : value;
        }
        if (isNil(value) || value === '') {
            throw this.exceptionFactory('Validation failed (no Date provided)');
        }
        const transformedValue = isString(value) || isNumber(value) || value instanceof Date
            ? new Date(value)
            : new Date(NaN);
        if (isNaN(transformedValue.getTime())) {
            throw this.exceptionFactory('Validation failed (invalid date format)');
        }
        return transformedValue;
    }
};
ParseDatePipe = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Object])
], ParseDatePipe);
export { ParseDatePipe };
