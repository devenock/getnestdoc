import { Module } from '../injector/module.js';
/**
 * Calls the `onApplicationBootstrap` function on the module and its children
 * (providers / controllers).
 *
 * @param moduleRef The module which will be initialized
 */
export declare function callModuleBootstrapHook(moduleRef: Module): Promise<any>;
