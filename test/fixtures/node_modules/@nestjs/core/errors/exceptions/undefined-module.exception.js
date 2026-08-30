import { RuntimeException } from './runtime.exception.js';
import { UNDEFINED_MODULE_MESSAGE } from '../messages.js';
export class UndefinedModuleException extends RuntimeException {
    constructor(parentModule, index, scope) {
        super(UNDEFINED_MODULE_MESSAGE(parentModule, index, scope));
    }
}
