import { __decorate, __metadata, __param } from "tslib";
import { Injectable, Optional } from '../decorators/core/index.js';
import { HttpStatus } from '../index.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil } from '../utils/shared.utils.js';
/**
 * Defines the built-in ParseFloat Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseFloatPipe = class ParseFloatPipe {
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
        return parseFloat(String(value));
    }
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is a valid float number
     */
    isNumeric(value) {
        if (typeof value === 'number')
            return Number.isFinite(value);
        if (typeof value !== 'string' || value === '' || value !== value.trim()) {
            return false;
        }
        if (value.startsWith('0x') ||
            value.startsWith('0X') ||
            value.startsWith('0b') ||
            value.startsWith('0B') ||
            value.startsWith('0o') ||
            value.startsWith('0O')) {
            return false;
        }
        return Number.isFinite(Number(value));
    }
};
ParseFloatPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseFloatPipe);
export { ParseFloatPipe };
