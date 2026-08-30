import { ModuleOpaqueKeyFactory } from './interfaces/module-opaque-key-factory.interface.js';
import { type DynamicModule, type Type } from '@nestjs/common';
export declare class DeepHashedModuleOpaqueKeyFactory implements ModuleOpaqueKeyFactory {
    private readonly moduleIdsCache;
    private readonly moduleTokenCache;
    private readonly logger;
    createForStatic(moduleCls: Type): string;
    createForDynamic(moduleCls: Type<unknown>, dynamicMetadata: Omit<DynamicModule, 'module'>): string;
    getStringifiedOpaqueToken(opaqueToken: object | undefined): string;
    getModuleId(metatype: Type<unknown>): string;
    getModuleName(metatype: Type<any>): string;
    private hashString;
    private replacer;
}
