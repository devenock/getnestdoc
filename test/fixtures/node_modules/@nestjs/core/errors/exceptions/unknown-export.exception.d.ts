import { RuntimeException } from './runtime.exception.js';
export declare class UnknownExportException extends RuntimeException {
    constructor(token: string | symbol, moduleName: string);
}
