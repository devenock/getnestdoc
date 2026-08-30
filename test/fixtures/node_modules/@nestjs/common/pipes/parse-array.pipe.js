import { __decorate, __metadata, __param } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { Optional } from '../decorators/core/optional.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode } from '../utils/http-error-by-code.util.js';
import { isNil, isString, isUndefined } from '../utils/shared.utils.js';
import { ValidationPipe } from './validation.pipe.js';
const VALIDATION_ERROR_MESSAGE = 'Validation failed (parsable array expected)';
const DEFAULT_ARRAY_SEPARATOR = ',';
/**
 * Defines the built-in ParseArray Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseArrayPipe = class ParseArrayPipe {
    options;
    validationPipe;
    exceptionFactory;
    constructor(options = {}) {
        this.options = options;
        this.validationPipe = new ValidationPipe({
            transform: true,
            validateCustomDecorators: true,
            ...options,
        });
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
        if (!value && !this.options.optional) {
            throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
        }
        else if (isNil(value) && this.options.optional) {
            return value;
        }
        if (!Array.isArray(value)) {
            if (!isString(value)) {
                throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
            }
            else {
                try {
                    value = value
                        .trim()
                        .split(this.options.separator || DEFAULT_ARRAY_SEPARATOR);
                }
                catch {
                    throw this.exceptionFactory(VALIDATION_ERROR_MESSAGE);
                }
            }
        }
        if (this.options.items) {
            const validationMetadata = {
                metatype: this.options.items,
                type: 'query',
            };
            const isExpectedTypePrimitive = this.isExpectedTypePrimitive();
            const toClassInstance = (item, index) => {
                if (this.options.items !== String) {
                    try {
                        item = JSON.parse(item);
                    }
                    catch {
                        // Do nothing
                    }
                }
                if (isExpectedTypePrimitive) {
                    return this.validatePrimitive(item, index);
                }
                return this.validationPipe.transform(item, validationMetadata);
            };
            if (this.options.stopAtFirstError === false) {
                // strict compare to "false" to make sure
                // that this option is disabled by default
                let errors = [];
                const targetArray = value;
                for (let i = 0; i < targetArray.length; i++) {
                    try {
                        targetArray[i] = await toClassInstance(targetArray[i]);
                    }
                    catch (err) {
                        let message;
                        if (err.getResponse) {
                            const response = err.getResponse();
                            if (Array.isArray(response.message)) {
                                message = response.message.map((item) => `[${i}] ${item}`);
                            }
                            else {
                                message = `[${i}] ${response.message}`;
                            }
                        }
                        else {
                            message = err;
                        }
                        errors = errors.concat(message);
                    }
                }
                if (errors.length > 0) {
                    throw this.exceptionFactory(errors);
                }
                return targetArray;
            }
            else {
                value = await Promise.all(value.map(toClassInstance));
            }
        }
        return value;
    }
    isExpectedTypePrimitive() {
        return [Boolean, Number, String].includes(this.options.items);
    }
    validatePrimitive(originalValue, index) {
        if (this.options.items === Number) {
            const value = originalValue !== null && originalValue !== '' ? +originalValue : NaN;
            if (isNaN(value)) {
                throw this.exceptionFactory(`${isUndefined(index) ? '' : `[${index}] `}item must be a number`);
            }
            return value;
        }
        else if (this.options.items === String) {
            if (!isString(originalValue)) {
                return `${originalValue}`;
            }
        }
        else if (this.options.items === Boolean) {
            if (typeof originalValue !== 'boolean') {
                throw this.exceptionFactory(`${isUndefined(index) ? '' : `[${index}] `}item must be a boolean value`);
            }
        }
        return originalValue;
    }
};
ParseArrayPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseArrayPipe);
export { ParseArrayPipe };
