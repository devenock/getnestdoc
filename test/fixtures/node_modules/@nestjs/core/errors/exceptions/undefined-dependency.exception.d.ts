import { InjectorDependencyContext } from '../../injector/injector.js';
import { Module } from '../../injector/module.js';
import { RuntimeException } from './runtime.exception.js';
export declare class UndefinedDependencyException extends RuntimeException {
    constructor(type: string, undefinedDependencyContext: InjectorDependencyContext, moduleRef?: Module);
}
