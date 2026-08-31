import { Logger } from '@nestjs/common';
import { isUndefined } from '@nestjs/common/utils/shared.utils.js';
import { flatten, isEqual, isFunction, isString, keyBy, mapValues, omit, omitBy, pick } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { getTypeIsArrayTuple } from '../decorators/helpers.js';
import { exploreGlobalApiExtraModelsMetadata } from '../explorers/api-extra-models.explorer.js';
import { getEnumType, getEnumValues, isEnumArray, isEnumMetadata } from '../utils/enum.utils.js';
import { getSchemaPath } from '../utils/index.js';
import { isBodyParameter } from '../utils/is-body-parameter.util.js';
import { isBuiltInType } from '../utils/is-built-in-type.util.js';
import { isDateCtor } from '../utils/is-date-ctor.util.js';
import { StandardSchemaOpenApiConverter } from './standard-schema-openapi.converter.js';
export class SchemaObjectFactory {
    constructor(modelPropertiesAccessor, swaggerTypesMapper, standardSchemaConverter) {
        this.modelPropertiesAccessor = modelPropertiesAccessor;
        this.swaggerTypesMapper = swaggerTypesMapper;
        this.standardSchemaConverter = standardSchemaConverter;
        this.standardSchemaOpenApiConverter = new StandardSchemaOpenApiConverter(this.standardSchemaConverter);
    }
    createFromModel(parameters, schemas) {
        const parameterObjects = parameters.map((param) => {
            const schemaOverride = this.getSchemaOverride(param, schemas);
            if (schemaOverride) {
                const overriddenParam = this.createSchemaOverrideParam(param, schemaOverride);
                if (overriddenParam) {
                    return overriddenParam;
                }
            }
            if (this.isLazyTypeFunc(param.type)) {
                [param.type, param.isArray] = getTypeIsArrayTuple(param.type(), undefined);
            }
            if (!isBodyParameter(param) && param.enumName) {
                return this.createEnumParam(param, schemas);
            }
            if (this.isPrimitiveType(param.type)) {
                return param;
            }
            if (this.isArrayCtor(param.type)) {
                return this.mapArrayCtorParam(param);
            }
            if (!isBodyParameter(param)) {
                return this.createQueryOrParamSchema(param, schemas);
            }
            return this.getCustomType(param, schemas);
        });
        return flatten(parameterObjects);
    }
    getCustomType(param, schemas) {
        const modelName = this.exploreModelSchema(param.type, schemas);
        const name = param.name || modelName;
        const schema = {
            ...(param.schema || {}),
            $ref: getSchemaPath(modelName)
        };
        const isArray = param.isArray;
        param = omit(param, 'isArray');
        if (isArray) {
            return {
                ...param,
                name,
                schema: {
                    type: 'array',
                    items: schema
                }
            };
        }
        return {
            ...param,
            name,
            schema
        };
    }
    createQueryOrParamSchema(param, schemas) {
        if (isDateCtor(param.type)) {
            return {
                format: 'date-time',
                ...param,
                type: 'string'
            };
        }
        if (this.isBigInt(param.type)) {
            return {
                format: 'int64',
                ...param,
                type: 'integer'
            };
        }
        if (isFunction(param.type)) {
            if (param.name) {
                const customType = this.getCustomType(param, schemas);
                const schemaOptionsKeys = [
                    ...this.swaggerTypesMapper.getSchemaOptionsKeys(),
                    'allOf'
                ];
                const schemaOptionsFromParam = {};
                for (const key of schemaOptionsKeys) {
                    if (key === 'type' || key === 'items') {
                        continue;
                    }
                    if (key in customType && !(key in (customType.schema || {}))) {
                        schemaOptionsFromParam[key] = customType[key];
                        delete customType[key];
                    }
                }
                if (Object.keys(schemaOptionsFromParam).length > 0) {
                    const existingSchema = (customType.schema || {});
                    if ('$ref' in existingSchema) {
                        const { $ref, allOf: existingAllOf, ...restSchema } = existingSchema;
                        const { allOf: paramAllOf, ...restParamOptions } = schemaOptionsFromParam;
                        const mergedAllOf = [
                            ...(Array.isArray(existingAllOf) ? existingAllOf : []),
                            ...(Array.isArray(paramAllOf) ? paramAllOf : []),
                            { $ref: $ref }
                        ];
                        customType.schema = {
                            ...restSchema,
                            ...restParamOptions,
                            allOf: mergedAllOf
                        };
                    }
                    else {
                        const mergedSchema = {
                            ...existingSchema,
                            ...schemaOptionsFromParam
                        };
                        const existingAllOf = existingSchema.allOf;
                        const paramAllOf = schemaOptionsFromParam.allOf;
                        if (Array.isArray(existingAllOf) && Array.isArray(paramAllOf)) {
                            mergedSchema.allOf = [...existingAllOf, ...paramAllOf];
                        }
                        customType.schema = mergedSchema;
                    }
                }
                return customType;
            }
            const propertiesWithType = this.extractPropertiesFromType(param.type, schemas);
            if (!propertiesWithType) {
                return param;
            }
            return propertiesWithType.map((property) => {
                const keysToOmit = [
                    'isArray',
                    'enumName',
                    'enumSchema',
                    'selfRequired'
                ];
                const parameterObject = {
                    ...omit(property, keysToOmit),
                    in: 'query',
                    required: 'selfRequired' in property
                        ? property.selfRequired
                        : typeof property.required === 'boolean'
                            ? property.required
                            : true
                };
                const keysToMoveToSchema = [
                    ...this.swaggerTypesMapper.getSchemaOptionsKeys(),
                    'allOf'
                ];
                return keysToMoveToSchema.reduce((acc, key) => {
                    if (key in property) {
                        acc.schema = { ...acc.schema, [key]: property[key] };
                        delete acc[key];
                    }
                    return acc;
                }, parameterObject);
            });
        }
        if (this.isConstEnumObject(param.type)) {
            const enumValues = getEnumValues(param.type);
            const enumType = getEnumType(enumValues);
            return {
                ...param,
                schema: {
                    type: enumType,
                    enum: enumValues
                },
                selfRequired: param.required
            };
        }
        if (this.isObjectLiteral(param.type)) {
            const schemaFromObjectLiteral = this.createFromObjectLiteral(param.name, param.type, schemas);
            if (param.isArray) {
                return {
                    ...param,
                    schema: {
                        type: 'array',
                        items: omit(schemaFromObjectLiteral, 'name')
                    },
                    selfRequired: param.required
                };
            }
            return {
                ...param,
                schema: {
                    type: schemaFromObjectLiteral.type,
                    properties: schemaFromObjectLiteral.properties,
                    required: schemaFromObjectLiteral.required
                },
                selfRequired: param.required
            };
        }
        return param;
    }
    extractPropertiesFromType(type, schemas, pendingSchemasRefs = []) {
        const { prototype } = type;
        if (!prototype) {
            return;
        }
        const extraModels = exploreGlobalApiExtraModelsMetadata(type);
        extraModels.forEach((item) => this.exploreModelSchema(item, schemas, pendingSchemasRefs));
        this.modelPropertiesAccessor.applyMetadataFactory(prototype);
        const modelProperties = this.modelPropertiesAccessor.getModelProperties(prototype);
        const propertiesWithType = modelProperties.map((key) => {
            let property;
            try {
                property = this.mergePropertyWithMetadata(key, prototype, schemas, pendingSchemasRefs);
            }
            catch (err) {
                if (err instanceof Error) {
                    const className = type?.name || 'UnknownType';
                    const prefix = `[${className}] `;
                    if (!err.message.startsWith(prefix)) {
                        err.message = `${prefix}${err.message}`;
                    }
                }
                throw err;
            }
            const schemaCombinators = ['oneOf', 'anyOf', 'allOf'];
            const declaredSchemaCombinator = schemaCombinators.find((combinator) => combinator in property);
            if (declaredSchemaCombinator) {
                const reflectedPropertyMetadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, prototype, key);
                const hasDeclaredSchemaCombinator = schemaCombinators.some((combinator) => combinator in (reflectedPropertyMetadata || {}));
                const schemaObjectMetadata = property;
                if (schemaObjectMetadata?.type === 'array' ||
                    schemaObjectMetadata.isArray) {
                    schemaObjectMetadata.items = {};
                    schemaObjectMetadata.items[declaredSchemaCombinator] =
                        property[declaredSchemaCombinator];
                    delete property[declaredSchemaCombinator];
                }
                else if (hasDeclaredSchemaCombinator) {
                    delete schemaObjectMetadata.type;
                }
            }
            return property;
        });
        return propertiesWithType;
    }
    exploreModelSchema(type, schemas, pendingSchemasRefs = []) {
        if (this.isLazyTypeFunc(type)) {
            type = type();
        }
        const propertiesWithType = this.extractPropertiesFromType(type, schemas, pendingSchemasRefs);
        if (!propertiesWithType) {
            return '';
        }
        const extensionProperties = Reflect.getMetadata(DECORATORS.API_EXTENSION, type) || {};
        const { schemaName, schemaProperties } = this.getSchemaMetadata(type);
        const typeDefinition = {
            type: 'object',
            properties: mapValues(keyBy(propertiesWithType, 'name'), (property) => {
                const keysToOmit = [
                    'name',
                    'isArray',
                    'enumName',
                    'enumSchema',
                    'selfRequired'
                ];
                if ('required' in property && Array.isArray(property.required)) {
                    return omit(property, keysToOmit);
                }
                return omit(property, [...keysToOmit, 'required']);
            }),
            ...extensionProperties,
            ...schemaProperties
        };
        const typeDefinitionRequiredFields = propertiesWithType
            .filter((property) => 'selfRequired' in property
            ? property.selfRequired != false
            : property.required != false && !Array.isArray(property.required))
            .map((property) => property.name);
        if (typeDefinitionRequiredFields.length > 0) {
            typeDefinition['required'] = typeDefinitionRequiredFields;
        }
        if (schemas[schemaName] && !isEqual(schemas[schemaName], typeDefinition)) {
            Logger.warn(`Duplicate DTO detected: "${schemaName}" is defined multiple times with different schemas.\n` +
                `Consider using unique class names or applying @ApiExtraModels() decorator with custom schema names.\n` +
                `Note: This will throw an error in the next major version.`);
        }
        schemas[schemaName] = typeDefinition;
        return schemaName;
    }
    getSchemaMetadata(type) {
        const schemas = Reflect.getOwnMetadata(DECORATORS.API_SCHEMA, type) ?? [];
        const { name, ...schemaProperties } = schemas[schemas.length - 1] ?? {};
        return { schemaName: name ?? type.name, schemaProperties };
    }
    mergePropertyWithMetadata(key, prototype, schemas, pendingSchemaRefs, metadata) {
        if (!metadata) {
            metadata =
                omit(Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, prototype, key), 'link') || {};
        }
        if (this.isLazyTypeFunc(metadata.type)) {
            metadata.type = metadata.type();
            [metadata.type, metadata.isArray] = getTypeIsArrayTuple(metadata.type, metadata.isArray);
        }
        if (Array.isArray(metadata.type)) {
            return this.createFromNestedArray(key, metadata, schemas, pendingSchemaRefs);
        }
        return this.createSchemaMetadata(key, metadata, schemas, pendingSchemaRefs);
    }
    createEnumParam(param, schemas) {
        const enumName = param.enumName;
        const $ref = getSchemaPath(enumName);
        if (!(enumName in schemas)) {
            const _enum = param.enum
                ? param.enum
                : param.schema
                    ? param.schema['items']
                        ? param.schema['items']['enum']
                        : param.schema['enum']
                    : param.isArray && param.items
                        ? param.items.enum
                        : undefined;
            schemas[enumName] = {
                type: (param.isArray
                    ? param.schema?.['items']?.['type']
                    : param.schema?.['type']) ?? 'string',
                enum: _enum,
                ...param.enumSchema,
                ...(param['x-enumNames'] ? { 'x-enumNames': param['x-enumNames'] } : {})
            };
        }
        else {
            if (param.enumSchema) {
                schemas[enumName] = {
                    ...schemas[enumName],
                    ...param.enumSchema
                };
            }
        }
        const newSchema = param.isArray || param.schema?.['items']
            ? { type: 'array', items: { $ref } }
            : { $ref };
        return omit({ ...param, schema: newSchema }, [
            'isArray',
            'items',
            'enumName',
            'enum',
            'x-enumNames',
            'enumSchema'
        ]);
    }
    createEnumSchemaType(key, metadata, schemas) {
        if (!('enumName' in metadata) || !metadata.enumName) {
            return {
                ...metadata,
                name: metadata.name || key
            };
        }
        const enumName = metadata.enumName;
        const $ref = getSchemaPath(enumName);
        const enumType = (metadata.isArray ? metadata.items['type'] : metadata.type) ?? 'string';
        if (!schemas[enumName]) {
            schemas[enumName] = {
                type: enumType,
                ...metadata.enumSchema,
                enum: metadata.isArray && metadata.items
                    ? metadata.items['enum']
                    : metadata.enum,
                description: metadata.description ?? undefined,
                'x-enumNames': metadata['x-enumNames'] ?? undefined
            };
        }
        else {
            if (metadata.enumSchema) {
                schemas[enumName] = {
                    ...schemas[enumName],
                    ...metadata.enumSchema
                };
            }
            if (metadata['x-enumNames']) {
                schemas[enumName]['x-enumNames'] = metadata['x-enumNames'];
            }
        }
        const _schemaObject = {
            ...metadata,
            name: metadata.name || key,
            type: metadata.isArray ? 'array' : 'string'
        };
        const existingCombinator = ['oneOf', 'anyOf'].find((key) => key in metadata && Array.isArray(metadata[key]));
        const refHost = metadata.isArray
            ? { items: { $ref } }
            : existingCombinator
                ? { [existingCombinator]: [...metadata[existingCombinator], { $ref }] }
                : { allOf: [{ $ref }] };
        const paramObject = { ..._schemaObject, ...refHost };
        const pathsToOmit = ['enum', 'enumName', 'enumSchema', 'x-enumNames'];
        if (!metadata.isArray) {
            pathsToOmit.push('type');
        }
        return omit(paramObject, pathsToOmit);
    }
    createNotBuiltInTypeReference(key, metadata, trueMetadataType, schemas, pendingSchemaRefs) {
        if (isUndefined(trueMetadataType)) {
            const errorIn = pendingSchemaRefs?.length > 0
                ? `in "${pendingSchemaRefs[pendingSchemaRefs.length - 1]}" `
                : '';
            throw new Error(`A circular dependency has been detected ${errorIn}(property key: "${key}"). To resolve this, use a lazy resolver for the property type ("type: () => ClassType") on each side of the relationship, or break the cycle by introducing a reference via @ApiExtraModels.`);
        }
        let { schemaName: schemaObjectName } = this.getSchemaMetadata(trueMetadataType);
        if (!(schemaObjectName in schemas) &&
            !pendingSchemaRefs.includes(schemaObjectName)) {
            schemaObjectName = this.exploreModelSchema(trueMetadataType, schemas, [...pendingSchemaRefs, schemaObjectName]);
        }
        const $ref = getSchemaPath(schemaObjectName);
        if (metadata.isArray) {
            return this.transformToArraySchemaProperty(metadata, key, { $ref });
        }
        const keysToRemove = ['type', 'isArray', 'required', 'name'];
        const validMetadataObject = omit(metadata, keysToRemove);
        const extraMetadataKeys = Object.keys(validMetadataObject);
        if (extraMetadataKeys.length > 0) {
            return {
                name: metadata.name || key,
                required: metadata.required,
                ...validMetadataObject,
                ...(validMetadataObject['nullable'] ? { type: 'object' } : {}),
                allOf: [{ $ref }]
            };
        }
        return {
            name: metadata.name || key,
            required: metadata.required,
            $ref
        };
    }
    transformToArraySchemaProperty(metadata, key, type) {
        const keysToRemove = ['type', 'enum'];
        const [movedProperties, keysToMove] = this.extractPropertyModifiers(metadata);
        const schemaHost = {
            ...omit(metadata, [...keysToRemove, ...keysToMove]),
            name: metadata.name || key,
            type: 'array',
            items: metadata.items
                ? { ...metadata.items, ...movedProperties }
                : isString(type)
                    ? { type, ...movedProperties }
                    : { ...type, ...movedProperties }
        };
        schemaHost.items = omitBy(schemaHost.items, isUndefined);
        return schemaHost;
    }
    mapArrayCtorParam(param) {
        return {
            ...omit(param, 'type'),
            schema: {
                type: 'array',
                items: {
                    type: 'string'
                }
            }
        };
    }
    createFromObjectLiteral(key, literalObj, schemas) {
        const objLiteralKeys = Object.keys(literalObj);
        const properties = {};
        const required = [];
        objLiteralKeys.forEach((key) => {
            const propertyCompilerMetadata = literalObj[key];
            if (isEnumArray(propertyCompilerMetadata)) {
                propertyCompilerMetadata.type = 'array';
                const enumValues = getEnumValues(propertyCompilerMetadata.enum);
                propertyCompilerMetadata.items = {
                    type: propertyCompilerMetadata.items?.type ?? getEnumType(enumValues),
                    enum: enumValues
                };
                delete propertyCompilerMetadata.enum;
            }
            else if (propertyCompilerMetadata.enum) {
                const enumValues = getEnumValues(propertyCompilerMetadata.enum);
                propertyCompilerMetadata.enum = enumValues;
                if (!propertyCompilerMetadata.type) {
                    propertyCompilerMetadata.type = getEnumType(enumValues);
                }
            }
            const propertyMetadata = this.mergePropertyWithMetadata(key, Object, schemas, [], propertyCompilerMetadata);
            if ('required' in propertyMetadata && propertyMetadata.required) {
                required.push(key);
            }
            const keysToRemove = ['isArray', 'name', 'required'];
            const validMetadataObject = omit(propertyMetadata, keysToRemove);
            properties[key] = validMetadataObject;
        });
        const schema = {
            name: key,
            type: 'object',
            properties,
            required
        };
        return schema;
    }
    createFromNestedArray(key, metadata, schemas, pendingSchemaRefs) {
        const recurse = (type) => {
            if (!Array.isArray(type)) {
                const schemaMetadata = this.createSchemaMetadata(key, metadata, schemas, pendingSchemaRefs, type);
                return omit(schemaMetadata, ['isArray', 'name']);
            }
            return {
                name: key,
                type: 'array',
                items: recurse(type[0])
            };
        };
        return recurse(metadata.type);
    }
    createSchemaMetadata(key, metadata, schemas, pendingSchemaRefs, nestedArrayType) {
        const typeRef = nestedArrayType || metadata.type;
        if (metadata.enum && typeRef === Object) {
            const enumValues = getEnumValues(metadata.enum);
            const enumType = getEnumType(enumValues);
            if (metadata.isArray) {
                return this.transformToArraySchemaProperty({
                    ...metadata,
                    items: {
                        type: enumType,
                        enum: enumValues
                    }
                }, key, { type: enumType, enum: enumValues });
            }
            return this.createSchemaMetadata(key, {
                ...metadata,
                type: enumType,
                enum: enumValues
            }, schemas, pendingSchemaRefs, enumType);
        }
        if (this.isConstEnumObject(typeRef)) {
            const enumValues = getEnumValues(typeRef);
            const enumType = getEnumType(enumValues);
            const syntheticMetadata = {
                ...metadata,
                type: enumType,
                enum: enumValues
            };
            return this.createSchemaMetadata(key, syntheticMetadata, schemas, pendingSchemaRefs, enumType);
        }
        if (this.isObjectLiteral(typeRef)) {
            const schemaFromObjectLiteral = this.createFromObjectLiteral(key, typeRef, schemas);
            if (metadata.isArray) {
                return {
                    name: schemaFromObjectLiteral.name,
                    type: 'array',
                    items: omit(schemaFromObjectLiteral, 'name'),
                    selfRequired: metadata.required
                };
            }
            return {
                ...schemaFromObjectLiteral,
                selfRequired: metadata.required
            };
        }
        if (isString(typeRef)) {
            if (isEnumMetadata(metadata)) {
                return this.createEnumSchemaType(key, metadata, schemas);
            }
            if (metadata.isArray) {
                return this.transformToArraySchemaProperty(metadata, key, typeRef);
            }
            return {
                ...metadata,
                name: metadata.name || key
            };
        }
        if (isDateCtor(typeRef)) {
            if (metadata.isArray) {
                return this.transformToArraySchemaProperty(metadata, key, {
                    format: metadata.format || 'date-time',
                    type: 'string'
                });
            }
            return {
                format: 'date-time',
                ...metadata,
                type: 'string',
                name: metadata.name || key
            };
        }
        if (this.isBigInt(typeRef)) {
            return {
                format: 'int64',
                ...metadata,
                type: 'integer',
                name: metadata.name || key
            };
        }
        if (!isBuiltInType(typeRef)) {
            return this.createNotBuiltInTypeReference(key, metadata, typeRef, schemas, pendingSchemaRefs);
        }
        const typeName = this.getTypeName(typeRef);
        const itemType = this.swaggerTypesMapper.mapTypeToOpenAPIType(typeName);
        if (metadata.isArray) {
            return this.transformToArraySchemaProperty(metadata, key, {
                type: itemType
            });
        }
        else if (itemType === 'array') {
            const defaultOnArray = 'string';
            const hasSchemaCombinator = ['oneOf', 'anyOf', 'allOf'].some((combinator) => combinator in metadata);
            if (hasSchemaCombinator) {
                return {
                    ...metadata,
                    type: undefined,
                    name: metadata.name || key
                };
            }
            return this.transformToArraySchemaProperty(metadata, key, {
                type: defaultOnArray
            });
        }
        return {
            ...metadata,
            name: metadata.name || key,
            type: itemType
        };
    }
    isArrayCtor(type) {
        return type === Array;
    }
    isPrimitiveType(type) {
        return (isFunction(type) &&
            [String, Boolean, Number].some((item) => item === type));
    }
    isLazyTypeFunc(type) {
        return isFunction(type) && type.name == 'type';
    }
    getTypeName(type) {
        return type && isFunction(type) ? type.name : type;
    }
    isObjectLiteral(obj) {
        if (typeof obj !== 'object' || !obj) {
            return false;
        }
        const hasOwnProp = Object.prototype.hasOwnProperty;
        let objPrototype = obj;
        while (Object.getPrototypeOf((objPrototype = Object.getPrototypeOf(objPrototype))) !== null)
            ;
        for (const prop in obj) {
            if (!hasOwnProp.call(obj, prop) && !hasOwnProp.call(objPrototype, prop)) {
                return false;
            }
        }
        return Object.getPrototypeOf(obj) === objPrototype;
    }
    isBigInt(type) {
        return type === BigInt;
    }
    isConstEnumObject(obj) {
        if (typeof obj !== 'object' || !obj || Array.isArray(obj)) {
            return false;
        }
        const values = Object.values(obj);
        if (values.length === 0) {
            return false;
        }
        return values.every((value) => typeof value === 'string' || typeof value === 'number');
    }
    extractPropertyModifiers(metadata) {
        const modifierKeys = [
            'format',
            'maximum',
            'maxLength',
            'minimum',
            'minLength',
            'pattern'
        ];
        return [pick(metadata, modifierKeys), modifierKeys];
    }
    createSchemaOverrideParam(param, schema) {
        const baseParam = omit(param, [
            'isArray',
            'standardSchema',
            'type'
        ]);
        if (isBodyParameter(param)) {
            const name = param.name || (isFunction(param.type) ? param.type.name : param.type);
            return {
                ...baseParam,
                name,
                schema
            };
        }
        if (param.name) {
            return {
                ...baseParam,
                schema
            };
        }
        if ('type' in schema &&
            schema.type === 'object' &&
            'properties' in schema) {
            const requiredProperties = new Set(Array.isArray(schema.required)
                ? schema.required
                : []);
            return Object.entries(schema.properties || {}).map(([name, propertySchema]) => ({
                ...baseParam,
                name,
                required: requiredProperties.has(name),
                schema: propertySchema
            }));
        }
        return undefined;
    }
    getSchemaOverride(param, schemas) {
        return this.standardSchemaOpenApiConverter.convertInto(param.standardSchema, schemas, 'input');
    }
}
