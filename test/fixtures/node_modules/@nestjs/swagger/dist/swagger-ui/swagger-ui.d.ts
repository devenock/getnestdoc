import { OpenAPIObject, SwaggerCustomOptions } from '../interfaces/index.js';
export declare function buildSwaggerInitJS(swaggerDoc: OpenAPIObject, customOptions?: SwaggerCustomOptions): string;
export declare function getSwaggerAssetsAbsoluteFSPath(): string;
export declare function buildSwaggerHTML(baseUrl: string, customOptions?: SwaggerCustomOptions): string;
