import { RuntimeException } from './runtime.exception.js';
export declare class UnknownModuleException extends RuntimeException {
    constructor(moduleName?: string);
}
