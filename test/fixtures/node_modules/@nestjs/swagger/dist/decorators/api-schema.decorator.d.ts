import { SchemaObjectMetadata } from '../interfaces/schema-object-metadata.interface.js';
export interface ApiSchemaOptions extends Pick<SchemaObjectMetadata, 'name'> {
    name?: string;
    description?: string;
}
export declare function ApiSchema(options?: ApiSchemaOptions): ClassDecorator;
