import { Type } from '@nestjs/common';
import { EnumSchemaAttributes } from '../interfaces/enum-schema-attributes.interface.js';
import { ParameterLocation, SchemaObject } from '../interfaces/open-api-spec.interface.js';
import { StandardSchemaObject } from '../interfaces/swagger-document-options.interface.js';
export interface ParamWithTypeMetadata {
    name?: string | number | object;
    type?: Type<unknown>;
    in?: ParameterLocation | 'body' | typeof PARAM_TOKEN_PLACEHOLDER;
    standardSchema?: StandardSchemaObject;
    isArray?: boolean;
    items?: SchemaObject;
    required?: boolean;
    enum?: unknown[];
    enumName?: string;
    enumSchema?: EnumSchemaAttributes;
    selfRequired?: boolean;
}
export type ParamsWithType = Record<string, ParamWithTypeMetadata>;
declare const PARAM_TOKEN_PLACEHOLDER = "placeholder";
export declare class ParameterMetadataAccessor {
    explore(instance: object, prototype: Type<unknown>, method: Function): ParamsWithType;
    private mapParamType;
}
export {};
