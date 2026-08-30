import { RuntimeException } from './runtime.exception.js';
export declare class UnknownElementException extends RuntimeException {
    constructor(name?: string | symbol);
}
