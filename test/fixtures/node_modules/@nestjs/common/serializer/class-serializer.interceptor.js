import { __decorate, __metadata, __param } from "tslib";
import { map } from 'rxjs/operators';
import { Inject, Injectable, Optional } from '../decorators/core/index.js';
import { StreamableFile } from '../file-stream/index.js';
import { loadPackage } from '../utils/load-package.util.js';
import { isObject } from '../utils/shared.utils.js';
import { CLASS_SERIALIZER_OPTIONS } from './class-serializer.constants.js';
let classTransformer = {};
// NOTE (external)
// We need to deduplicate them here due to the circular dependency
// between core and common packages
const REFLECTOR = 'Reflector';
/**
 * @publicApi
 */
let ClassSerializerInterceptor = class ClassSerializerInterceptor {
    reflector;
    defaultOptions;
    constructor(reflector, defaultOptions = {}) {
        this.reflector = reflector;
        this.defaultOptions = defaultOptions;
        classTransformer =
            defaultOptions?.transformerPackage ??
                loadPackage('class-transformer', 'ClassSerializerInterceptor', () => import('class-transformer'));
    }
    async intercept(context, next) {
        classTransformer = (await classTransformer);
        const contextOptions = this.getContextOptions(context);
        const options = {
            ...this.defaultOptions,
            ...contextOptions,
        };
        return next
            .handle()
            .pipe(map((res) => this.serialize(res, options)));
    }
    /**
     * Serializes responses that are non-null objects nor streamable files.
     */
    serialize(response, options) {
        if (!isObject(response) || response instanceof StreamableFile) {
            return response;
        }
        return Array.isArray(response)
            ? response.map(item => this.transformToPlain(item, options))
            : this.transformToPlain(response, options);
    }
    transformToPlain(plainOrClass, options) {
        if (!plainOrClass) {
            return plainOrClass;
        }
        if (!options.type) {
            return classTransformer.classToPlain(plainOrClass, options);
        }
        if (plainOrClass instanceof options.type) {
            return classTransformer.classToPlain(plainOrClass, options);
        }
        const instance = classTransformer.plainToInstance(options.type, plainOrClass, options);
        return classTransformer.classToPlain(instance, options);
    }
    getContextOptions(context) {
        return this.reflector.getAllAndOverride(CLASS_SERIALIZER_OPTIONS, [
            context.getHandler(),
            context.getClass(),
        ]);
    }
};
ClassSerializerInterceptor = __decorate([
    Injectable(),
    __param(0, Inject(REFLECTOR)),
    __param(1, Optional()),
    __metadata("design:paramtypes", [Object, Object])
], ClassSerializerInterceptor);
export { ClassSerializerInterceptor };
