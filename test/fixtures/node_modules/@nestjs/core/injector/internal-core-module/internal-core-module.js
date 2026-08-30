var InternalCoreModule_1;
import { __decorate } from "tslib";
import { Global, Module } from '@nestjs/common';
import { requestProvider } from '../../router/request/request-providers.js';
import { Reflector } from '../../services/index.js';
import { inquirerProvider } from '../inquirer/inquirer-providers.js';
const ReflectorAliasProvider = {
    provide: Reflector.name,
    useExisting: Reflector,
};
let InternalCoreModule = InternalCoreModule_1 = class InternalCoreModule {
    static register(providers) {
        return {
            module: InternalCoreModule_1,
            providers: [...providers],
            exports: [...providers.map(item => item.provide)],
        };
    }
};
InternalCoreModule = InternalCoreModule_1 = __decorate([
    Global(),
    Module({
        providers: [
            Reflector,
            ReflectorAliasProvider,
            requestProvider,
            inquirerProvider,
        ],
        exports: [
            Reflector,
            ReflectorAliasProvider,
            requestProvider,
            inquirerProvider,
        ],
    })
], InternalCoreModule);
export { InternalCoreModule };
