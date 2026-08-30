import { ModuleOpaqueKeyFactory } from './interfaces/module-opaque-key-factory.interface.js';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
export declare class ByReferenceModuleOpaqueKeyFactory implements ModuleOpaqueKeyFactory {
    private readonly keyGenerationStrategy;
    constructor(options?: {
        keyGenerationStrategy: 'random' | 'shallow';
    });
    createForStatic(moduleCls: Type, originalRef?: Type | ForwardReference): string;
    createForDynamic(moduleCls: Type<unknown>, dynamicMetadata: Omit<DynamicModule, 'module'>, originalRef: DynamicModule | ForwardReference): string;
    private getOrCreateModuleId;
    private hashString;
    private generateRandomString;
}
