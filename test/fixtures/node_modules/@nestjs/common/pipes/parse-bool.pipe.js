import { __decorate, __metadata, __param } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { Optional } from '../decorators/core/optional.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil } from '../utils/shared.utils.js';
/**
 * Defines the built-in ParseBool Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseBoolPipe = class ParseBoolPipe {
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
        if (this.isTrue(value)) {
            return true;
        }
        if (this.isFalse(value)) {
            return false;
        }
        throw this.exceptionFactory('Validation failed (boolean string is expected)');
    }
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is said 'true', ie., if it is equal to the boolean
     * `true` or the string `"true"`
     */
    isTrue(value) {
        return value === true || value === 'true';
    }
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is said 'false', ie., if it is equal to the boolean
     * `false` or the string `"false"`
     */
    isFalse(value) {
        return value === false || value === 'false';
    }
};
ParseBoolPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseBoolPipe);
export { ParseBoolPipe };
