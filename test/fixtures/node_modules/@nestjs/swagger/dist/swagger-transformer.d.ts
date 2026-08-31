import { DenormalizedDoc } from './interfaces/denormalized-doc.interface.js';
import { OpenAPIObject } from './interfaces/index.js';
export declare class SwaggerTransformer {
    normalizePaths(denormalizedDoc: DenormalizedDoc[]): Pick<OpenAPIObject, 'paths' | 'webhooks'> & {
        webhookPaths?: OpenAPIObject['paths'];
    };
}
