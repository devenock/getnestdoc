import type { ParamData } from '@nestjs/common';
import { ExecutionContextHost } from './execution-context-host.js';
import { type Controller } from '@nestjs/common/internal';
import type { ContextType, PipeTransform } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
export interface ParamProperties<T = any, IExtractor extends Function = any> {
    index: number;
    type: T | string;
    data: ParamData;
    pipes: PipeTransform[];
    extractValue: IExtractor;
    schema?: StandardSchemaV1;
}
export declare class ContextUtils {
    mapParamType(key: string): string;
    reflectCallbackParamtypes(instance: Controller, methodName: string): any[];
    reflectCallbackMetadata<T = any>(instance: Controller, methodName: string, metadataKey: string): T;
    reflectPassthrough(instance: Controller, methodName: string): boolean;
    getArgumentsLength<T>(keys: string[], metadata: T): number;
    createNullArray(length: number): any[];
    mergeParamsMetatypes(paramsProperties: ParamProperties[], paramtypes: any[]): (ParamProperties & {
        metatype?: any;
    })[];
    getCustomFactory(factory: (...args: unknown[]) => void, data: unknown, contextFactory: (args: unknown[]) => ExecutionContextHost): (...args: unknown[]) => unknown;
    getContextFactory<TContext extends string = ContextType>(contextType: TContext, instance?: object, callback?: Function): (args: unknown[]) => ExecutionContextHost;
}
