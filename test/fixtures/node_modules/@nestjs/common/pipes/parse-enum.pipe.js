import { __decorate, __metadata, __param } from "tslib";
import { Injectable, Optional } from '../decorators/core/index.js';
import { HttpStatus } from '../index.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil } from '../utils/shared.utils.js';
/**
 * Defines the built-in ParseEnum Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseEnumPipe = class ParseEnumPipe {
    enumType;
    options;
    exceptionFactory;
    constructor(enumType, options) {
        this.enumType = enumType;
        this.options = options;
        if (!enumType) {
            throw new Error(`"ParseEnumPipe" requires "enumType" argument specified (to validate input values).`);
        }
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
        if (!this.isEnum(value)) {
            throw this.exceptionFactory('Validation failed (enum string is expected)');
        }
        return value;
    }
    isEnum(value) {
        const enumValues = Object.keys(this.enumType)
            .filter(key => {
            const enumValue = this.enumType[key];
            return !(typeof enumValue === 'string' &&
                typeof this.enumType[enumValue] === 'number');
        })
            .map(key => this.enumType[key]);
        return enumValues.includes(value);
    }
};
ParseEnumPipe = __decorate([
    Injectable(),
    __param(1, Optional()),
    __metadata("design:paramtypes", [Object, Object])
], ParseEnumPipe);
export { ParseEnumPipe };
