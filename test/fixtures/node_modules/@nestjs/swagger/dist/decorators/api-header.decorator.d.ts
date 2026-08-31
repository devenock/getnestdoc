import { ParameterObject } from '../interfaces/open-api-spec.interface.js';
import { SwaggerEnumType } from '../types/swagger-enum.type.js';
export interface ApiHeaderOptions extends Omit<ParameterObject, 'in'> {
    enum?: SwaggerEnumType;
    extensions?: Record<string, any>;
}
export declare function ApiHeader(options: ApiHeaderOptions): MethodDecorator & ClassDecorator;
export declare const ApiHeaders: (headers: ApiHeaderOptions[]) => MethodDecorator & ClassDecorator;
