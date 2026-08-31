import { ApiResponseMetadata, ApiResponseSchemaHost } from '../decorators/index.js';
import { SchemaObject } from '../interfaces/open-api-spec.interface.js';
import { StandardSchemaConverter } from '../interfaces/swagger-document-options.interface.js';
export type FactoriesNeededByResponseFactory = {
    linkName: (controllerKey: string, methodKey: string, fieldKey: string) => string;
    operationId: (controllerKey: string, methodKey: string) => string;
};
export declare class ResponseObjectFactory {
    private readonly standardSchemaConverter?;
    private readonly mimetypeContentWrapper;
    private readonly modelPropertiesAccessor;
    private readonly swaggerTypesMapper;
    private readonly standardSchemaOpenApiConverter;
    private readonly schemaObjectFactory;
    private readonly responseObjectMapper;
    constructor(standardSchemaConverter?: StandardSchemaConverter);
    create(response: ApiResponseMetadata, produces: string[], schemas: Record<string, SchemaObject>, factories: FactoriesNeededByResponseFactory): (ApiResponseSchemaHost & import("../decorators/api-response.decorator.js").ApiResponseCommonMetadata & {
        example?: any;
    }) | (ApiResponseSchemaHost & import("../decorators/api-response.decorator.js").ApiResponseCommonMetadata & {
        examples?: {
            [key: string]: import("../decorators/api-response.decorator.js").ApiResponseExamples;
        };
    }) | {
        content: import("../interfaces/open-api-spec.interface.js").ContentObject;
    };
    private getSchemaOverride;
}
