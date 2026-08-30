import { UNKNOWN_DEPENDENCIES_MESSAGE } from '../messages.js';
import { RuntimeException } from './runtime.exception.js';
export class UndefinedDependencyException extends RuntimeException {
    constructor(type, undefinedDependencyContext, moduleRef) {
        super(UNKNOWN_DEPENDENCIES_MESSAGE(type, undefinedDependencyContext, moduleRef));
    }
}
