import type { StandardSchemaV1 } from '@standard-schema/spec';
import { Observable } from 'rxjs';
import { CallHandler, ExecutionContext, NestInterceptor } from '../interfaces/index.js';
import { StandardSchemaSerializerContextOptions } from './standard-schema-serializer.interfaces.js';
interface PlainLiteralObject {
    [key: string]: any;
}
/**
 * @publicApi
 */
export interface StandardSchemaSerializerInterceptorOptions {
    /**
     * A default standard schema to use for serialization when no schema
     * is provided via `@SerializeOptions()`.
     */
    schema?: StandardSchemaV1;
    /**
     * Default options forwarded to the schema's `~standard.validate()` call.
     * Can be overridden per-handler via `@SerializeOptions({ validateOptions })`.
     */
    validateOptions?: StandardSchemaV1.Options;
}
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
export declare class StandardSchemaSerializerInterceptor implements NestInterceptor {
    protected readonly reflector: any;
    protected readonly defaultOptions: StandardSchemaSerializerInterceptorOptions;
    constructor(reflector: any, defaultOptions?: StandardSchemaSerializerInterceptorOptions);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
    /**
     * Serializes responses that are non-null objects nor streamable files.
     */
    serialize(response: PlainLiteralObject | Array<PlainLiteralObject>, schema: StandardSchemaV1 | undefined, validateOptions?: StandardSchemaV1.Options): PlainLiteralObject | Array<PlainLiteralObject> | Promise<PlainLiteralObject | Array<PlainLiteralObject>>;
    transformToPlain(plainOrClass: any, schema: StandardSchemaV1, validateOptions?: StandardSchemaV1.Options): Promise<PlainLiteralObject>;
    protected getContextOptions(context: ExecutionContext): StandardSchemaSerializerContextOptions | undefined;
}
export {};
