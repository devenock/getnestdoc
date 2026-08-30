import { Module } from '../injector/module.js';
/**
 * Calls the `beforeApplicationShutdown` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 * @param signal The signal which caused the shutdown
 */
export declare function callBeforeAppShutdownHook(moduleRef: Module, signal?: string): Promise<void>;
