import { RuntimeException } from './runtime.exception.js';
export declare class UndefinedModuleException extends RuntimeException {
    constructor(parentModule: any, index: number, scope: any[]);
}
