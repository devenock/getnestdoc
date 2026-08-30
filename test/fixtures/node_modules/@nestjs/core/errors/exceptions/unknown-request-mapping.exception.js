import { RuntimeException } from './runtime.exception.js';
import { UNKNOWN_REQUEST_MAPPING } from '../messages.js';
export class UnknownRequestMappingException extends RuntimeException {
    constructor(metatype) {
        super(UNKNOWN_REQUEST_MAPPING(metatype));
    }
}
