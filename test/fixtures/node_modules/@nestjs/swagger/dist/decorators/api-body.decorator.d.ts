import { Type } from '@nestjs/common';
import { EncodingObject, ExamplesObject, ReferenceObject, RequestBodyObject, SchemaObject } from '../interfaces/open-api-spec.interface.js';
import { SwaggerEnumType } from '../types/swagger-enum.type.js';
type RequestBodyOptions = Omit<RequestBodyObject, 'content'>;
interface ApiBodyMetadata extends RequestBodyOptions {
    type?: Type<unknown> | Function | [Function] | string;
    isArray?: boolean;
    enum?: SwaggerEnumType;
    encoding?: EncodingObject;
}
interface ApiBodySchemaHost extends RequestBodyOptions {
    schema: SchemaObject | ReferenceObject;
    examples?: ExamplesObject;
    encoding?: EncodingObject;
}
export type ApiBodyOptions = ApiBodyMetadata | ApiBodySchemaHost;
export declare function ApiBody(options: ApiBodyOptions): MethodDecorator;
export {};
