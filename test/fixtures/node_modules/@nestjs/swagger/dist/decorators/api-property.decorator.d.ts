import { Type } from '@nestjs/common';
import { EnumSchemaAttributes } from '../interfaces/enum-schema-attributes.interface.js';
import { SchemaObjectMetadata } from '../interfaces/schema-object-metadata.interface.js';
export type ApiPropertyCommonOptions = SchemaObjectMetadata & {
    'x-enumNames'?: string[];
    link?: () => Type<unknown> | Function;
    exampleMaxDepth?: number;
};
export type ApiPropertyOptions = ApiPropertyCommonOptions | (ApiPropertyCommonOptions & {
    enumName: string;
    enumSchema?: EnumSchemaAttributes;
});
export declare function ApiProperty(options?: ApiPropertyOptions): PropertyDecorator;
export declare function createApiPropertyDecorator(options?: ApiPropertyOptions, overrideExisting?: boolean): PropertyDecorator;
export declare function ApiPropertyOptional(options?: ApiPropertyOptions): PropertyDecorator;
export declare function ApiResponseProperty(options?: Pick<ApiPropertyOptions, 'type' | 'example' | 'format' | 'deprecated' | 'enum'>): PropertyDecorator;
