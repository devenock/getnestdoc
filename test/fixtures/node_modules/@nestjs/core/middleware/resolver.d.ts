import { Injector } from '../injector/injector.js';
import { Module } from '../injector/module.js';
import { MiddlewareContainer } from './container.js';
export declare class MiddlewareResolver {
    private readonly middlewareContainer;
    private readonly injector;
    constructor(middlewareContainer: MiddlewareContainer, injector: Injector);
    resolveInstances(moduleRef: Module, moduleName: string): Promise<void>;
    private resolveMiddlewareInstance;
}
