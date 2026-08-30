import { __decorate, __metadata, __param } from "tslib";
import { types } from 'util';
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { Optional } from '../decorators/core/optional.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
/**
 * Built-in JavaScript types that should be excluded from prototype stripping
 * to avoid conflicts with test frameworks like Jest's useFakeTimers
 */
const BUILT_IN_TYPES = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet];
/**
 * Defines the built-in StandardSchemaValidation Pipe.
 *
 * Uses a standard schema object (conforming to the Standard Schema spec)
 * attached to the parameter metadata to validate incoming values.
 *
 * @see [Standard Schema](https://github.com/standard-schema/standard-schema)
 *
 * @publicApi
 */
let StandardSchemaValidationPipe = class StandardSchemaValidationPipe {
    options;
    isTransformEnabled;
    validateCustomDecorators;
    validateOptions;
    exceptionFactory;
    constructor(options) {
        this.options = options;
        const { transform = true, validateCustomDecorators = false, validateOptions, exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST, } = options || {};
        this.isTransformEnabled = transform;
        this.validateCustomDecorators = validateCustomDecorators;
        this.validateOptions = validateOptions;
        this.exceptionFactory =
            exceptionFactory ||
                (issues => {
                    const messages = this.formatIssueMessages(issues);
                    return new HttpErrorByCode[errorHttpStatusCode](messages);
                });
    }
    /**
     * Formats Standard Schema validation issues into a flat list of error messages.
     * When an issue includes a path, the path is prefixed to the message.
     */
    formatIssueMessages(issues) {
        return issues.map(issue => {
            if (issue.path?.length) {
                return `${issue.path.map(String).join('.')}: ${issue.message}`;
            }
            return issue.message;
        });
    }
    /**
     * Method that validates the incoming value against the standard schema
     * provided in the parameter metadata.
     *
     * @param value currently processed route argument
     * @param metadata contains metadata about the currently processed route argument
     */
    async transform(value, metadata) {
        const schema = metadata.schema;
        if (!schema || !this.toValidate(metadata)) {
            return value;
        }
        this.stripProtoKeys(value);
        const result = await this.validate(value, schema, this.validateOptions);
        if (result.issues) {
            throw this.exceptionFactory(result.issues);
        }
        return this.isTransformEnabled ? result.value : value;
    }
    /**
     * Determines whether validation should be performed for the given metadata.
     * Skips validation for custom decorators unless `validateCustomDecorators` is enabled.
     *
     * @param metadata contains metadata about the currently processed route argument
     * @returns `true` if validation should be performed
     */
    toValidate(metadata) {
        const { type } = metadata;
        if (type === 'custom' && !this.validateCustomDecorators) {
            return false;
        }
        return true;
    }
    /**
     * Validates a value against a standard schema.
     * Can be overridden to customize validation behavior.
     *
     * @param value The value to validate
     * @param schema The standard schema to validate against
     * @param options Optional options forwarded to the schema's validate method
     * @returns The validation result
     */
    validate(value, schema, options) {
        return schema['~standard'].validate(value, options);
    }
    /**
     * Strips dangerous prototype pollution keys from an object.
     */
    stripProtoKeys(value) {
        if (value == null ||
            typeof value !== 'object' ||
            types.isTypedArray(value)) {
            return;
        }
        if (BUILT_IN_TYPES.some(type => value instanceof type)) {
            return;
        }
        if (Array.isArray(value)) {
            for (const v of value) {
                this.stripProtoKeys(v);
            }
            return;
        }
        delete value.__proto__;
        delete value.prototype;
        const constructorType = value?.constructor;
        if (constructorType && !BUILT_IN_TYPES.includes(constructorType)) {
            delete value.constructor;
        }
        for (const key in value) {
            this.stripProtoKeys(value[key]);
        }
    }
};
StandardSchemaValidationPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], StandardSchemaValidationPipe);
export { StandardSchemaValidationPipe };
