import { UNKNOWN_DEPENDENCIES_MESSAGE } from '../messages.js';
import { RuntimeException } from './runtime.exception.js';
export class UnknownDependenciesException extends RuntimeException {
    type;
    context;
    metadata;
    moduleRef;
    constructor(type, context, moduleRef, metadata) {
        super(UNKNOWN_DEPENDENCIES_MESSAGE(type, context, moduleRef));
        this.type = type;
        this.context = context;
        this.metadata = metadata;
        this.moduleRef = moduleRef && { id: moduleRef.id };
    }
}
