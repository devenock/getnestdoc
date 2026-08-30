import { UNDEFINED_FORWARDREF_MESSAGE } from '../messages.js';
import { RuntimeException } from './runtime.exception.js';
export class UndefinedForwardRefException extends RuntimeException {
    constructor(scope) {
        super(UNDEFINED_FORWARDREF_MESSAGE(scope));
    }
}
