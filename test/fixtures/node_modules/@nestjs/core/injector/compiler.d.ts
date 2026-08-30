import { ModuleOpaqueKeyFactory } from './opaque-key-factory/interfaces/module-opaque-key-factory.interface.js';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
export interface ModuleFactory {
    type: Type<any>;
    token: string;
    dynamicMetadata?: Partial<DynamicModule>;
}
export declare class ModuleCompiler {
    private readonly _moduleOpaqueKeyFactory;
    constructor(_moduleOpaqueKeyFactory: ModuleOpaqueKeyFactory);
    get moduleOpaqueKeyFactory(): ModuleOpaqueKeyFactory;
    compile(moduleClsOrDynamic: Type | DynamicModule | ForwardReference | Promise<DynamicModule>): Promise<ModuleFactory>;
    extractMetadata(moduleClsOrDynamic: Type | ForwardReference | DynamicModule): {
        type: Type;
        dynamicMetadata: Omit<DynamicModule, 'module'> | undefined;
    };
    isDynamicModule(moduleClsOrDynamic: Type | DynamicModule | ForwardReference): moduleClsOrDynamic is DynamicModule;
}
