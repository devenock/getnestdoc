import { INVALID_CLASS_SCOPE_MESSAGE } from '../messages.js';
import { RuntimeException } from './runtime.exception.js';
import { isFunction } from '@nestjs/common/internal';
export class InvalidClassScopeException extends RuntimeException {
    constructor(metatypeOrToken) {
        let name = isFunction(metatypeOrToken)
            ? metatypeOrToken.name
            : metatypeOrToken;
        name = name && name.toString();
        super(INVALID_CLASS_SCOPE_MESSAGE `${name}`);
    }
}
