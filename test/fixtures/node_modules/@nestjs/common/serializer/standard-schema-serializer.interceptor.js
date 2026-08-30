import { __decorate, __metadata, __param } from "tslib";
import { concatMap } from 'rxjs/operators';
import { Inject, Injectable, Optional } from '../decorators/core/index.js';
import { StreamableFile } from '../file-stream/index.js';
import { isObject } from '../utils/shared.utils.js';
import { CLASS_SERIALIZER_OPTIONS } from './class-serializer.constants.js';
// NOTE (external)
// We need to deduplicate them here due to the circular dependency
// between core and common packages
const REFLECTOR = 'Reflector';
/**
 * An interceptor that serializes outgoing responses using a Standard Schema.
 *
 * The schema can be provided either:
 * - As a default option in the interceptor constructor
 * - Per-handler or per-class via `@SerializeOptions({ schema })` decorator
 *
 * When a schema is present, the interceptor validates/transforms the response
 * through the schema's `~standard.validate()` method. If validation fails,
 * the issues are thrown as an error.
 *
 * @see [Standard Schema](https://github.com/standard-schema/standard-schema)
 *
 * @publicApi
 */
let StandardSchemaSerializerInterceptor = class StandardSchemaSerializerInterceptor {
    reflector;
    defaultOptions;
    constructor(reflector, defaultOptions = {}) {
        this.reflector = reflector;
        this.defaultOptions = defaultOptions;
    }
    intercept(context, next) {
        const contextOptions = this.getContextOptions(context);
        const schema = contextOptions?.schema ?? this.defaultOptions.schema;
        const validateOptions = contextOptions?.validateOptions ?? this.defaultOptions.validateOptions;
        return next
            .handle()
            .pipe(concatMap(async (res) => this.serialize(res, schema, validateOptions)));
    }
    /**
     * Serializes responses that are non-null objects nor streamable files.
     */
    serialize(response, schema, validateOptions) {
        if (!schema || !isObject(response) || response instanceof StreamableFile) {
            return response;
        }
        return Array.isArray(response)
            ? Promise.all(response.map(item => this.transformToPlain(item, schema, validateOptions)))
            : this.transformToPlain(response, schema, validateOptions);
    }
    async transformToPlain(plainOrClass, schema, validateOptions) {
        if (!plainOrClass) {
            return plainOrClass;
        }
        const result = await schema['~standard'].validate(plainOrClass, validateOptions);
        if (result.issues) {
            throw new Error(`Serialization failed: ${result.issues.map(i => i.message).join(', ')}`);
        }
        return result.value;
    }
    getContextOptions(context) {
        return this.reflector.getAllAndOverride(CLASS_SERIALIZER_OPTIONS, [
            context.getHandler(),
            context.getClass(),
        ]);
    }
};
StandardSchemaSerializerInterceptor = __decorate([
    Injectable(),
    __param(0, Inject(REFLECTOR)),
    __param(1, Optional()),
    __metadata("design:paramtypes", [Object, Object])
], StandardSchemaSerializerInterceptor);
export { StandardSchemaSerializerInterceptor };
