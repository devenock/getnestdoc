import { isEmpty, isFunction, omit, pick } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { isBuiltInType } from '../utils/is-built-in-type.util.js';
import { MimetypeContentWrapper } from './mimetype-content-wrapper.js';
import { ModelPropertiesAccessor } from './model-properties-accessor.js';
import { ResponseObjectMapper } from './response-object-mapper.js';
import { SchemaObjectFactory } from './schema-object-factory.js';
import { StandardSchemaOpenApiConverter } from './standard-schema-openapi.converter.js';
import { SwaggerTypesMapper } from './swagger-types-mapper.js';
export class ResponseObjectFactory {
    constructor(standardSchemaConverter) {
        this.standardSchemaConverter = standardSchemaConverter;
        this.mimetypeContentWrapper = new MimetypeContentWrapper();
        this.modelPropertiesAccessor = new ModelPropertiesAccessor();
        this.swaggerTypesMapper = new SwaggerTypesMapper();
        this.standardSchemaOpenApiConverter = new StandardSchemaOpenApiConverter(this.standardSchemaConverter);
        this.schemaObjectFactory = new SchemaObjectFactory(this.modelPropertiesAccessor, this.swaggerTypesMapper, this.standardSchemaConverter);
        this.responseObjectMapper = new ResponseObjectMapper();
    }
    create(response, produces, schemas, factories) {
        const { type, isArray } = response;
        const schemaOverride = this.getSchemaOverride(response, schemas);
        response = omit(response, ['isArray', 'standardSchema']);
        if (schemaOverride) {
            return this.responseObjectMapper.wrapSchemaWithContent({
                ...omit(response, ['type']),
                schema: isArray
                    ? { type: 'array', items: schemaOverride }
                    : schemaOverride
            }, produces);
        }
        if (!type) {
            return this.responseObjectMapper.wrapSchemaWithContent(response, produces);
        }
        if (isBuiltInType(type)) {
            const typeName = type && isFunction(type) ? type.name : type;
            const swaggerType = this.swaggerTypesMapper.mapTypeToOpenAPIType(typeName);
            const exampleKeys = ['example', 'examples'];
            const baseSchema = isArray
                ? { type: 'array', items: { type: swaggerType } }
                : { type: swaggerType };
            const schema = response.nullable
                ? { ...baseSchema, nullable: true }
                : baseSchema;
            const content = this.mimetypeContentWrapper.wrap(produces, {
                schema,
                ...pick(response, exampleKeys)
            });
            return {
                ...omit(response, [...exampleKeys, 'nullable']),
                ...content
            };
        }
        const name = this.schemaObjectFactory.exploreModelSchema(type, schemas);
        if (isFunction(type) && type.prototype) {
            const { prototype } = type;
            const links = {};
            const properties = this.modelPropertiesAccessor.getModelProperties(prototype);
            const generateLink = (controllerPrototype, method, parameter, field) => {
                if (!factories) {
                    return;
                }
                const linkName = factories.linkName(controllerPrototype.constructor.name, method.name, field);
                links[linkName] = {
                    operationId: factories.operationId(controllerPrototype.constructor.name, method.name),
                    parameters: {
                        [parameter]: `$response.body#/${field}`
                    }
                };
            };
            for (const key of properties) {
                const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, prototype, key) ?? {};
                if (!metadata.link) {
                    continue;
                }
                const linkedType = metadata.link();
                const linkedGetterInfo = Reflect.getMetadata(DECORATORS.API_DEFAULT_GETTER, linkedType.prototype);
                if (!linkedGetterInfo) {
                    continue;
                }
                const { getter, parameter, prototype: controllerPrototype } = linkedGetterInfo;
                generateLink(controllerPrototype, getter, parameter, key);
            }
            const customLinks = Reflect.getMetadata(DECORATORS.API_LINK, prototype);
            for (const customLink of customLinks ?? []) {
                const { method, parameter, field, prototype: controllerPrototype } = customLink;
                generateLink(controllerPrototype, method, parameter, field);
            }
            if (!isEmpty(links)) {
                response.links = Object.assign(links, response.links);
            }
        }
        if (isArray) {
            return this.responseObjectMapper.toArrayRefObject(response, name, produces);
        }
        return this.responseObjectMapper.toRefObject(response, name, produces);
    }
    getSchemaOverride(response, schemas) {
        return this.standardSchemaOpenApiConverter.convertInto(response.standardSchema, schemas, 'output');
    }
}
