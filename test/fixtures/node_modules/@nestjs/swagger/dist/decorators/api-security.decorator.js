import { isString } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { extendMetadata } from '../utils/extend-metadata.util.js';
export function ApiSecurity(name, requirements = []) {
    let metadata;
    if (isString(name)) {
        metadata = [{ [name]: requirements }];
    }
    else {
        metadata = [name];
    }
    return (target, key, descriptor) => {
        if (descriptor) {
            metadata = extendMetadata(metadata, DECORATORS.API_SECURITY, descriptor.value);
            Reflect.defineMetadata(DECORATORS.API_SECURITY, metadata, descriptor.value);
            return descriptor;
        }
        metadata = extendMetadata(metadata, DECORATORS.API_SECURITY, target);
        Reflect.defineMetadata(DECORATORS.API_SECURITY, metadata, target);
        return target;
    };
}
