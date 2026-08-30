import { type DynamicModule } from '@nestjs/common';
import type { ExistingProvider, FactoryProvider, ValueProvider } from '@nestjs/common';
export declare class InternalCoreModule {
    static register(providers: Array<ValueProvider | FactoryProvider | ExistingProvider>): DynamicModule;
}
