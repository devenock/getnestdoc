import { RuntimeException } from './runtime.exception.js';
import type { Abstract, Type } from '@nestjs/common';
export declare class InvalidClassScopeException extends RuntimeException {
    constructor(metatypeOrToken: Type<any> | Abstract<any> | string | symbol);
}
