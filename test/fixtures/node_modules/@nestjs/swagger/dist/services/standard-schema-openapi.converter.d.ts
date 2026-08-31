import type { StandardSchemaConverter } from '../interfaces/swagger-document-options.interface.js';
import { ReferenceObject, SchemaObject } from '../interfaces/open-api-spec.interface.js';
export interface ConvertedStandardSchema {
    schema: SchemaObject | ReferenceObject;
    components: Record<string, SchemaObject>;
}
export declare class StandardSchemaOpenApiConverter {
    private readonly schemaConverter?;
    constructor(schemaConverter?: StandardSchemaConverter);
    convertInto(schema: unknown, schemas: Record<string, SchemaObject>, schemaType?: 'input' | 'output'): SchemaObject | ReferenceObject | undefined;
    convert(schema: unknown, schemaType?: 'input' | 'output'): ConvertedStandardSchema | undefined;
    private convertSchema;
    private isStandardSchema;
    private hasStandardJsonSchema;
    private normalizeCustomConvertedSchema;
    private normalizeConvertedSchema;
    private rewriteComponents;
    private getDefinitionEntries;
    private rewriteDefinitionRefs;
    private rewriteSchemaMap;
    private rewriteValue;
    private normalizeSchemaExamples;
    private normalizeSchemaConst;
}
