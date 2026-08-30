import { Module } from '../injector/module.js';
/**
 * Calls the `onModuleDestroy` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 */
export declare function callModuleDestroyHook(moduleRef: Module): Promise<any>;
