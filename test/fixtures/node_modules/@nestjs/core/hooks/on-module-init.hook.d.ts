import { Module } from '../injector/module.js';
/**
 * Calls the `onModuleInit` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 */
export declare function callModuleInitHook(moduleRef: Module): Promise<void>;
