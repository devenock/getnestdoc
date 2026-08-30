import { Module } from '../injector/module.js';
/**
 * Calls the `onApplicationShutdown` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 * @param signal
 */
export declare function callAppShutdownHook(moduleRef: Module, signal?: string): Promise<any>;
