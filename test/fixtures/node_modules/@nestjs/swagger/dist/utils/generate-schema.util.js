import { ModelPropertiesAccessor } from '../services/model-properties-accessor.js';
import { SchemaObjectFactory } from '../services/schema-object-factory.js';
import { SwaggerTypesMapper } from '../services/swagger-types-mapper.js';
export function generateSchema(target, extraSchemas = {}) {
    const factory = new SchemaObjectFactory(new ModelPropertiesAccessor(), new SwaggerTypesMapper());
    const schemas = { ...extraSchemas };
    factory.exploreModelSchema(target, schemas);
    return { schema: schemas[target.name], schemas };
}
