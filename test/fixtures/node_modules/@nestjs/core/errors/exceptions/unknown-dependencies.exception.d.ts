import { InjectorDependencyContext } from '../../injector/injector.js';
import { Module } from '../../injector/module.js';
import { RuntimeException } from './runtime.exception.js';
export declare class UnknownDependenciesException extends RuntimeException {
    readonly type: string | symbol;
    readonly context: InjectorDependencyContext;
    readonly metadata?: {
        id: string;
    } | undefined;
    readonly moduleRef: {
        id: string;
    } | undefined;
    constructor(type: string | symbol, context: InjectorDependencyContext, moduleRef?: Module, metadata?: {
        id: string;
    } | undefined);
}
