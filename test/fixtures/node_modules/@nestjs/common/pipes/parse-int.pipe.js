import { __decorate, __metadata, __param } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { Optional } from '../decorators/core/optional.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil } from '../utils/shared.utils.js';
/**
 * Defines the built-in ParseInt Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseIntPipe = class ParseIntPipe {
    options;
    exceptionFactory;
    constructor(options) {
        this.options = options;
        options = options || {};
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
    async transform(value, metadata) {
        if (isNil(value) && this.options?.optional) {
            return value;
        }
        if (!this.isNumeric(value)) {
            throw this.exceptionFactory('Validation failed (numeric string is expected)');
        }
        return parseInt(String(value), 10);
    }
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is a valid integer number
     */
    isNumeric(value) {
        return (['string', 'number'].includes(typeof value) &&
            /^-?\d+$/.test(String(value)) &&
            isFinite(value));
    }
};
ParseIntPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseIntPipe);
export { ParseIntPipe };
