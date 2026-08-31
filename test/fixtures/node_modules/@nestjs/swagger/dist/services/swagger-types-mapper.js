import { isFunction, isString, isUndefined, omit, omitBy, pick } from 'es-toolkit/compat';
export class SwaggerTypesMapper {
    constructor() {
        this.keysToRemove = [
            'isArray',
            'enum',
            'enumName',
            'enumSchema',
            '$ref',
            'standardSchema',
            'selfRequired',
            ...this.getSchemaOptionsKeys()
        ];
    }
    mapParamTypes(parameters) {
        return parameters.map((param) => {
            if (this.hasSchemaDefinition(param) ||
                this.hasRawContentDefinition(param)) {
                if (Array.isArray(param.required) && 'schema' in param) {
                    param.schema.required = param.required;
                    delete param.required;
                }
                if ('selfRequired' in param) {
                    param.required = param.selfRequired;
                }
                return this.omitParamKeys(param);
            }
            const { type } = param;
            const typeName = type && isFunction(type)
                ? this.mapTypeToOpenAPIType(type.name)
                : this.mapTypeToOpenAPIType(type);
            const paramWithTypeMetadata = omitBy({
                ...param,
                type: typeName
            }, isUndefined);
            if (this.isEnumArrayType(paramWithTypeMetadata)) {
                return this.mapEnumArrayType(paramWithTypeMetadata, this.keysToRemove);
            }
            else if (paramWithTypeMetadata.isArray) {
                return this.mapArrayType(paramWithTypeMetadata, this.keysToRemove);
            }
            return {
                ...omit(param, this.keysToRemove),
                schema: omitBy({
                    ...this.getSchemaOptions(param),
                    ...(param.schema || {}),
                    enum: paramWithTypeMetadata.enum,
                    type: paramWithTypeMetadata.type,
                    $ref: paramWithTypeMetadata.$ref
                }, isUndefined)
            };
        });
    }
    mapTypeToOpenAPIType(type) {
        if (!(type && type.charAt)) {
            return;
        }
        return type.charAt(0).toLowerCase() + type.slice(1);
    }
    mapEnumArrayType(param, keysToRemove) {
        return {
            ...omit(param, keysToRemove),
            schema: {
                ...this.getSchemaOptions(param),
                type: 'array',
                items: param.items
            }
        };
    }
    mapArrayType(param, keysToRemove) {
        const itemsModifierKeys = ['format', 'maximum', 'minimum', 'pattern'];
        const items = param.items ||
            omitBy({
                ...(param.schema || {}),
                enum: param.enum,
                type: this.mapTypeToOpenAPIType(param.type)
            }, isUndefined);
        const modifierProperties = pick(param, itemsModifierKeys);
        return {
            ...omit(param, keysToRemove),
            schema: {
                ...omit(this.getSchemaOptions(param), [...itemsModifierKeys]),
                type: 'array',
                items: isString(items.type)
                    ? { type: items.type, ...modifierProperties }
                    : { ...items.type, ...modifierProperties }
            }
        };
    }
    getSchemaOptionsKeys() {
        return [
            'properties',
            'patternProperties',
            'additionalProperties',
            'minimum',
            'maximum',
            'maxProperties',
            'minItems',
            'minProperties',
            'maxItems',
            'minLength',
            'maxLength',
            'exclusiveMaximum',
            'exclusiveMinimum',
            'uniqueItems',
            'multipleOf',
            'title',
            'format',
            'pattern',
            'nullable',
            'default',
            'example',
            'oneOf',
            'anyOf',
            'type',
            'items'
        ];
    }
    getSchemaOptions(param) {
        const schemaKeys = this.getSchemaOptionsKeys();
        const optionsObject = schemaKeys.reduce((acc, key) => ({
            ...acc,
            [key]: param[key]
        }), {});
        return omitBy(optionsObject, isUndefined);
    }
    isEnumArrayType(param) {
        return param.isArray && param.items && param.items.enum;
    }
    hasSchemaDefinition(param) {
        return !!param.schema;
    }
    hasRawContentDefinition(param) {
        return 'content' in param;
    }
    omitParamKeys(param) {
        return omit(param, this.keysToRemove);
    }
}
