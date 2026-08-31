import { omit } from 'es-toolkit/compat';
const SCHEMA_MAP_KEYWORDS = new Set([
    'properties',
    'patternProperties',
    'dependentSchemas',
    '$defs',
    'definitions'
]);
export class StandardSchemaOpenApiConverter {
    constructor(schemaConverter) {
        this.schemaConverter = schemaConverter;
    }
    convertInto(schema, schemas, schemaType = 'input') {
        const convertedSchema = this.convert(schema, schemaType);
        if (!convertedSchema) {
            return undefined;
        }
        Object.assign(schemas, convertedSchema.components);
        return convertedSchema.schema;
    }
    convert(schema, schemaType = 'input') {
        if (!this.isStandardSchema(schema)) {
            return undefined;
        }
        return this.convertSchema(schema, schemaType);
    }
    convertSchema(schema, schemaType) {
        const customSchema = this.schemaConverter?.(schema, { schemaType });
        if (customSchema) {
            return this.normalizeCustomConvertedSchema(customSchema);
        }
        if (!this.hasStandardJsonSchema(schema)) {
            return undefined;
        }
        const convert = schema['~standard'].jsonSchema?.[schemaType];
        if (!convert) {
            return undefined;
        }
        const convertedSchema = convert({ target: 'openapi-3.0' });
        if (!convertedSchema || typeof convertedSchema !== 'object') {
            return undefined;
        }
        return this.normalizeConvertedSchema(convertedSchema);
    }
    isStandardSchema(schema) {
        return !!(schema && typeof schema === 'object' && '~standard' in schema);
    }
    hasStandardJsonSchema(schema) {
        const standard = schema['~standard'];
        return !!standard && 'jsonSchema' in standard;
    }
    normalizeCustomConvertedSchema(convertedSchema) {
        return {
            schema: this.rewriteValue(convertedSchema.schema),
            components: this.rewriteComponents(convertedSchema.components || {})
        };
    }
    normalizeConvertedSchema(schema) {
        return {
            schema: this.rewriteValue(omit(schema, ['$defs', 'definitions', '$schema'])),
            components: this.rewriteComponents(Object.fromEntries(this.getDefinitionEntries(schema)))
        };
    }
    rewriteComponents(components) {
        const rewrittenComponents = {};
        for (const [name, definition] of Object.entries(components)) {
            rewrittenComponents[name] = this.rewriteDefinitionRefs(definition);
        }
        return rewrittenComponents;
    }
    getDefinitionEntries(schema) {
        const definitions = schema.$defs || schema.definitions;
        if (!definitions || typeof definitions !== 'object') {
            return [];
        }
        return Object.entries(definitions);
    }
    rewriteDefinitionRefs(value, isSchema = true) {
        if (Array.isArray(value)) {
            return value.map((item) => this.rewriteValue(item));
        }
        const rewrittenValue = {};
        for (const [key, currentValue] of Object.entries(value)) {
            const rewrittenChild = isSchema && SCHEMA_MAP_KEYWORDS.has(key)
                ? this.rewriteSchemaMap(currentValue)
                : this.rewriteValue(currentValue);
            if (rewrittenChild !== undefined) {
                rewrittenValue[key] = rewrittenChild;
            }
        }
        return isSchema
            ? this.normalizeSchemaExamples(rewrittenValue)
            : rewrittenValue;
    }
    rewriteSchemaMap(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return this.rewriteValue(value);
        }
        return this.rewriteDefinitionRefs(value, false);
    }
    rewriteValue(value) {
        if (Array.isArray(value)) {
            return value.map((item) => this.rewriteValue(item));
        }
        if (!value || typeof value !== 'object') {
            return value;
        }
        const currentValue = value;
        if (typeof currentValue.$ref === 'string') {
            return {
                ...this.rewriteDefinitionRefs(omit(currentValue, ['$ref'])),
                $ref: currentValue.$ref
                    .replace('#/$defs/', '#/components/schemas/')
                    .replace('#/definitions/', '#/components/schemas/')
            };
        }
        return this.rewriteDefinitionRefs(currentValue);
    }
    normalizeSchemaExamples(value) {
        const normalizedConstValue = this.normalizeSchemaConst(value);
        if (!Array.isArray(normalizedConstValue.examples) ||
            normalizedConstValue.example !== undefined) {
            return normalizedConstValue;
        }
        const [firstExample] = normalizedConstValue.examples;
        return {
            ...omit(normalizedConstValue, ['examples']),
            example: firstExample
        };
    }
    normalizeSchemaConst(value) {
        if (!('const' in value)) {
            return value;
        }
        return {
            ...omit(value, ['const']),
            enum: [value.const]
        };
    }
}
