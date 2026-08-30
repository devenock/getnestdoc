import { RuntimeException } from './runtime.exception.js';
export declare class InvalidModuleException extends RuntimeException {
    constructor(parentModule: any, index: number, scope: any[], receivedValue: unknown);
}
