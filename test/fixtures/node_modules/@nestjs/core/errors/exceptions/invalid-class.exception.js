import { INVALID_CLASS_MESSAGE } from '../messages.js';
import { RuntimeException } from './runtime.exception.js';
export class InvalidClassException extends RuntimeException {
    constructor(value) {
        super(INVALID_CLASS_MESSAGE `${value}`);
    }
}
