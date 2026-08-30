import type { Type } from '@nestjs/common';
import { RuntimeException } from './runtime.exception.js';
export declare class UnknownRequestMappingException extends RuntimeException {
    constructor(metatype: Type);
}
