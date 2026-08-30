import { RuntimeException } from './runtime.exception.js';
import type { Type } from '@nestjs/common';
export declare class UndefinedForwardRefException extends RuntimeException {
    constructor(scope: Type<any>[]);
}
