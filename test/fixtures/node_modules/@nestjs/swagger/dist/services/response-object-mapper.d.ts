import { ApiResponseMetadata, ApiResponseSchemaHost } from '../decorators/index.js';
export declare class ResponseObjectMapper {
    private readonly mimetypeContentWrapper;
    toArrayRefObject(response: Record<string, any>, name: string, produces: string[]): {
        content: import("../index.js").ContentObject;
    };
    toRefObject(response: Record<string, any>, name: string, produces: string[]): {
        content: import("../index.js").ContentObject;
    };
    wrapSchemaWithContent(response: ApiResponseSchemaHost & ApiResponseMetadata, produces: string[]): (ApiResponseSchemaHost & import("../decorators/api-response.decorator.js").ApiResponseCommonMetadata & {
        example?: any;
    }) | (ApiResponseSchemaHost & import("../decorators/api-response.decorator.js").ApiResponseCommonMetadata & {
        examples?: {
            [key: string]: import("../decorators/api-response.decorator.js").ApiResponseExamples;
        };
    }) | {
        content: import("../index.js").ContentObject;
        schema?: import("../index.js").SchemaObject & Partial<import("../index.js").ReferenceObject>;
        status?: number | "default" | "1XX" | "2XX" | "3XX" | "4XX" | "5XX";
        description?: string;
        summary?: string;
        headers?: import("../index.js").HeadersObject;
        links?: import("../index.js").LinksObject;
        type?: import("@nestjs/common").Type<unknown> | Function | [Function] | string;
        standardSchema?: import("../index.js").StandardSchemaObject;
        isArray?: boolean;
        nullable?: boolean;
        example?: any;
    } | {
        content: import("../index.js").ContentObject;
        schema?: import("../index.js").SchemaObject & Partial<import("../index.js").ReferenceObject>;
        status?: number | "default" | "1XX" | "2XX" | "3XX" | "4XX" | "5XX";
        description?: string;
        summary?: string;
        headers?: import("../index.js").HeadersObject;
        links?: import("../index.js").LinksObject;
        type?: import("@nestjs/common").Type<unknown> | Function | [Function] | string;
        standardSchema?: import("../index.js").StandardSchemaObject;
        isArray?: boolean;
        nullable?: boolean;
        examples?: {
            [key: string]: import("../decorators/api-response.decorator.js").ApiResponseExamples;
        };
    };
}
