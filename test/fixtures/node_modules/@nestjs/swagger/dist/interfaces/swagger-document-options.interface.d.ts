import type { StandardJSONSchemaV1, StandardSchemaV1 } from '@standard-schema/spec';
export type OperationIdFactory = (controllerKey: string, methodKey: string, version?: string) => string;
export type StandardJsonSchemaConverter = StandardJSONSchemaV1.Converter;
export type StandardSchemaObject = StandardSchemaV1 | StandardJSONSchemaV1;
export interface StandardSchemaConversionResult {
    schema: unknown;
    components?: Record<string, any>;
}
export type StandardSchemaConverter = (schema: unknown, options: {
    schemaType: 'input' | 'output';
}) => StandardSchemaConversionResult | undefined;
export interface SwaggerDocumentOptions {
    include?: Function[];
    extraModels?: Function[];
    ignoreGlobalPrefix?: boolean;
    deepScanRoutes?: boolean;
    operationIdFactory?: OperationIdFactory;
    linkNameFactory?: (controllerKey: string, methodKey: string, fieldKey: string) => string;
    autoTagControllers?: boolean;
    onlyIncludeDecoratedEndpoints?: boolean;
    excludeDynamicDefaults?: boolean;
    exampleMaxDepth?: number;
    standardSchemaConverter?: StandardSchemaConverter;
}
