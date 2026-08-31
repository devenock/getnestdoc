import { isString } from 'es-toolkit/compat';
export function getEnumValues(enumType) {
    if (typeof enumType === 'function') {
        return getEnumValues(enumType());
    }
    if (Array.isArray(enumType)) {
        return enumType;
    }
    if (typeof enumType !== 'object') {
        return [];
    }
    const numericValues = Object.values(enumType)
        .filter((value) => typeof value === 'number')
        .map((value) => value.toString());
    return Object.keys(enumType)
        .filter((key) => !numericValues.includes(key))
        .map((key) => enumType[key]);
}
export function getEnumType(values) {
    const hasString = values.filter(isString).length > 0;
    if (hasString) {
        return 'string';
    }
    const hasBoolean = values.filter((v) => typeof v === 'boolean').length > 0;
    return hasBoolean ? 'boolean' : 'number';
}
export function addEnumArraySchema(paramDefinition, decoratorOptions) {
    const paramSchema = paramDefinition.schema || {};
    paramDefinition.schema = paramSchema;
    paramSchema.type = 'array';
    delete paramDefinition.isArray;
    const enumValues = getEnumValues(decoratorOptions.enum);
    paramSchema.items = {
        type: getEnumType(enumValues),
        enum: enumValues
    };
    if (decoratorOptions.enumName) {
        paramDefinition.enumName = decoratorOptions.enumName;
    }
    if (decoratorOptions.enumSchema) {
        paramDefinition.enumSchema = decoratorOptions.enumSchema;
    }
}
export function addEnumSchema(paramDefinition, decoratorOptions) {
    const paramSchema = paramDefinition.schema || {};
    const enumValues = getEnumValues(decoratorOptions.enum);
    paramDefinition.schema = paramSchema;
    paramSchema.enum = enumValues;
    paramSchema.type = getEnumType(enumValues);
    if (decoratorOptions.enumName) {
        paramDefinition.enumName = decoratorOptions.enumName;
    }
    if (decoratorOptions.enumSchema) {
        paramDefinition.enumSchema = decoratorOptions.enumSchema;
    }
}
export const isEnumArray = (obj) => obj.isArray && obj.enum;
export const isEnumDefined = (obj) => obj.enum;
export const isEnumMetadata = (metadata) => metadata.enum || (metadata.isArray && metadata.items?.['enum']);
