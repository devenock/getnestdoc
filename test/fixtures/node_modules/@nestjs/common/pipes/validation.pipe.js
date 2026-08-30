import { __decorate, __metadata, __param } from "tslib";
import { iterate } from 'iterare';
import { types } from 'util';
import { Injectable } from '../decorators/core/index.js';
import { Optional } from '../decorators/index.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { loadPackage } from '../utils/load-package.util.js';
import { isNil, isUndefined } from '../utils/shared.utils.js';
let classValidator = {};
let classTransformer = {};
/**
 * Built-in JavaScript types that should be excluded from prototype stripping
 * to avoid conflicts with test frameworks like Jest's useFakeTimers
 */
const BUILT_IN_TYPES = [Date, RegExp, Error, Map, Set, WeakMap, WeakSet];
/**
 * @see [Validation](https://docs.nestjs.com/techniques/validation)
 *
 * @publicApi
 */
let ValidationPipe = class ValidationPipe {
    isTransformEnabled;
    isDetailedOutputDisabled;
    validatorOptions;
    transformOptions;
    errorHttpStatusCode;
    expectedType;
    exceptionFactory;
    validateCustomDecorators;
    errorFormat;
    constructor(options) {
        options = options || {};
        const { transform, disableErrorMessages, errorHttpStatusCode, expectedType, transformOptions, exceptionFactory, validatorPackage, transformerPackage, validateCustomDecorators, errorFormat, ...validatorOptions } = options;
        // @see [https://github.com/nestjs/nest/issues/10683#issuecomment-1413690508](https://github.com/nestjs/nest/issues/10683#issuecomment-1413690508)
        this.validatorOptions = { forbidUnknownValues: false, ...validatorOptions };
        this.isTransformEnabled = !!transform;
        this.transformOptions = transformOptions;
        this.isDetailedOutputDisabled = disableErrorMessages;
        this.validateCustomDecorators = validateCustomDecorators || false;
        this.errorHttpStatusCode = errorHttpStatusCode || HttpStatus.BAD_REQUEST;
        this.expectedType = expectedType;
        this.errorFormat = errorFormat || 'list';
        this.exceptionFactory = exceptionFactory || this.createExceptionFactory();
        classValidator = this.loadValidator(validatorPackage);
        classTransformer = this.loadTransformer(transformerPackage);
    }
    loadValidator(validatorPackage) {
        return (validatorPackage ??
            loadPackage('class-validator', 'ValidationPipe', () => import('class-validator')));
    }
    loadTransformer(transformerPackage) {
        return (transformerPackage ??
            loadPackage('class-transformer', 'ValidationPipe', () => import('class-transformer')));
    }
    async transform(value, metadata) {
        if (this.expectedType) {
            metadata = { ...metadata, metatype: this.expectedType };
        }
        const metatype = metadata.metatype;
        if (!metatype || !this.toValidate(metadata)) {
            return this.isTransformEnabled
                ? this.transformPrimitive(value, metadata)
                : value;
        }
        classValidator = (await classValidator);
        classTransformer = (await classTransformer);
        const originalValue = value;
        value = this.toEmptyIfNil(value, metatype);
        const isNil = value !== originalValue;
        const isPrimitive = this.isPrimitive(value);
        this.stripProtoKeys(value);
        let entity = classTransformer.plainToInstance(metatype, value, this.transformOptions);
        const originalEntity = entity;
        const isCtorNotEqual = entity.constructor !== metatype;
        if (isCtorNotEqual && !isPrimitive) {
            entity.constructor = metatype;
        }
        else if (isCtorNotEqual) {
            // when "entity" is a primitive value, we have to temporarily
            // replace the entity to perform the validation against the original
            // metatype defined inside the handler
            entity = { constructor: metatype };
        }
        const errors = await this.validate(entity, this.validatorOptions);
        if (errors.length > 0) {
            throw await this.exceptionFactory(errors);
        }
        if (originalValue === undefined && originalEntity === '') {
            // Since SWC requires empty string for validation (to avoid an error),
            // a fallback is needed to revert to the original value (when undefined).
            // @see [https://github.com/nestjs/nest/issues/14430](https://github.com/nestjs/nest/issues/14430)
            return originalValue;
        }
        if (isPrimitive) {
            // if the value is a primitive value and the validation process has been successfully completed
            // we have to revert the original value passed through the pipe
            entity = originalEntity;
        }
        if (this.isTransformEnabled) {
            return entity;
        }
        if (isNil) {
            // if the value was originally undefined or null, revert it back
            return originalValue;
        }
        // we check if the number of keys of the "validatorOptions" is higher than 1 (instead of 0)
        // because the "forbidUnknownValues" now fallbacks to "false" (in case it wasn't explicitly specified)
        const shouldTransformToPlain = Object.keys(this.validatorOptions).length > 1;
        return shouldTransformToPlain
            ? classTransformer.classToPlain(entity, this.transformOptions)
            : value;
    }
    createExceptionFactory() {
        return (validationErrors = []) => {
            if (this.isDetailedOutputDisabled) {
                return new HttpErrorByCode[this.errorHttpStatusCode]();
            }
            if (this.errorFormat === 'grouped') {
                const errors = this.groupValidationErrors(validationErrors);
                // Custom (object) bodies are returned verbatim by
                // `HttpException.createBody`, so add the standard envelope fields
                // explicitly to match the shape of the "list" format.
                const { message: error, statusCode } = new HttpErrorByCode[this.errorHttpStatusCode]().getResponse();
                return new HttpErrorByCode[this.errorHttpStatusCode]({
                    message: errors,
                    error,
                    statusCode,
                });
            }
            const errors = this.flattenValidationErrors(validationErrors);
            return new HttpErrorByCode[this.errorHttpStatusCode](errors);
        };
    }
    toValidate(metadata) {
        const { metatype, type } = metadata;
        if (type === 'custom' && !this.validateCustomDecorators) {
            return false;
        }
        const types = [String, Boolean, Number, Array, Object, Buffer, Date];
        return !types.some(t => metatype === t) && !isNil(metatype);
    }
    transformPrimitive(value, metadata) {
        if (!metadata.data) {
            // leave top-level query/param objects unmodified
            return value;
        }
        const { type, metatype } = metadata;
        if (type !== 'param' && type !== 'query') {
            return value;
        }
        if (metatype === Boolean) {
            if (isUndefined(value)) {
                // This is an workaround to deal with optional boolean values since
                // optional booleans shouldn't be parsed to a valid boolean when
                // they were not defined
                return undefined;
            }
            // Any fasly value but `undefined` will be parsed to `false`
            return value === true || value === 'true';
        }
        if (metatype === Number) {
            if (isUndefined(value)) {
                // This is a workaround to deal with optional numeric values since
                // optional numerics shouldn't be parsed to a valid number when
                // they were not defined
                return undefined;
            }
            return +value;
        }
        if (metatype === String && !isUndefined(value)) {
            return String(value);
        }
        return value;
    }
    toEmptyIfNil(value, metatype) {
        if (!isNil(value)) {
            return value;
        }
        if (typeof metatype === 'function' ||
            (metatype && 'prototype' in metatype && metatype.prototype?.constructor)) {
            return {};
        }
        // SWC requires empty string to be returned instead of an empty object
        // when the value is nil and the metatype is not a class instance, but a plain object (enum, for example).
        // Otherwise, the error will be thrown.
        // @see [https://github.com/nestjs/nest/issues/12680](https://github.com/nestjs/nest/issues/12680)
        return '';
    }
    stripProtoKeys(value) {
        if (value == null ||
            typeof value !== 'object' ||
            types.isTypedArray(value)) {
            return;
        }
        // Skip built-in JavaScript primitives to avoid Jest useFakeTimers conflicts
        if (BUILT_IN_TYPES.some(type => value instanceof type)) {
            return;
        }
        if (Array.isArray(value)) {
            for (const v of value) {
                this.stripProtoKeys(v);
            }
            return;
        }
        // Delete dangerous prototype pollution keys
        delete value.__proto__;
        delete value.prototype;
        // Only delete constructor if it's NOT a built-in type
        const constructorType = value?.constructor;
        if (constructorType && !BUILT_IN_TYPES.includes(constructorType)) {
            delete value.constructor;
        }
        for (const key in value) {
            this.stripProtoKeys(value[key]);
        }
    }
    isPrimitive(value) {
        return ['number', 'boolean', 'string'].includes(typeof value);
    }
    validate(object, validatorOptions) {
        return classValidator.validate(object, validatorOptions);
    }
    flattenValidationErrors(validationErrors) {
        return iterate(validationErrors)
            .map(error => this.mapChildrenToValidationErrors(error))
            .flatten()
            .filter(item => !!item.constraints)
            .map(item => Object.values(item.constraints))
            .flatten()
            .toArray();
    }
    groupValidationErrors(validationErrors, parentPath) {
        const result = {};
        for (const error of validationErrors) {
            const path = parentPath
                ? `${parentPath}.${error.property}`
                : error.property;
            if (error.constraints) {
                result[path] = Object.values(error.constraints);
            }
            if (error.children && error.children.length) {
                Object.assign(result, this.groupValidationErrors(error.children, path));
            }
        }
        return result;
    }
    mapChildrenToValidationErrors(error, parentPath) {
        if (!(error.children && error.children.length)) {
            return [error];
        }
        const validationErrors = [];
        parentPath = parentPath
            ? `${parentPath}.${error.property}`
            : error.property;
        for (const item of error.children) {
            if (item.children && item.children.length) {
                validationErrors.push(...this.mapChildrenToValidationErrors(item, parentPath));
            }
            validationErrors.push(this.prependConstraintsWithParentProp(parentPath, item));
        }
        return validationErrors;
    }
    prependConstraintsWithParentProp(parentPath, error) {
        const constraints = {};
        for (const key in error.constraints) {
            constraints[key] = `${parentPath}.${error.constraints[key]}`;
        }
        return {
            ...error,
            constraints,
        };
    }
};
ValidationPipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ValidationPipe);
export { ValidationPipe };
