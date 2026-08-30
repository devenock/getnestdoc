import { ClassSerializerContextOptions } from '../class-serializer.interfaces.js';
import { StandardSchemaSerializerContextOptions } from '../standard-schema-serializer.interfaces.js';
/**
 * @publicApi
 */
export declare const SerializeOptions: (options: ClassSerializerContextOptions | StandardSchemaSerializerContextOptions) => import("../../decorators/index.js").CustomDecorator<string>;
