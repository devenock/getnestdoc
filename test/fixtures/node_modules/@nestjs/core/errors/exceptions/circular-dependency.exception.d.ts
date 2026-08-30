import { RuntimeException } from './runtime.exception.js';
export declare class CircularDependencyException extends RuntimeException {
    constructor(context?: string);
}
