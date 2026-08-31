import { Type } from '@nestjs/common';
export declare function setMappedTypeClassName<T, K extends keyof T>(target: Function, prefix: string, classRef: Type<T>, keys?: readonly K[]): void;
export declare function clonePluginMetadataFactory(target: Type<unknown>, parent: Type<unknown>, transformFn?: (metadata: Record<string, any>) => Record<string, any>): void;
