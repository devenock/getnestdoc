import type { StandardSchemaV1 } from '@standard-schema/spec';
import { ParamData, RouteParamMetadata } from '../decorators/http/route-params.decorator.js';
import { CustomParamFactory } from '../interfaces/features/custom-route-param-factory.interface.js';
import { PipeTransform, Type } from '../interfaces/index.js';
export declare function assignCustomParameterMetadata(args: Record<number, RouteParamMetadata>, paramtype: number | string, index: number, factory: CustomParamFactory, data?: ParamData, schema?: StandardSchemaV1, ...pipes: (Type<PipeTransform> | PipeTransform)[]): {};
