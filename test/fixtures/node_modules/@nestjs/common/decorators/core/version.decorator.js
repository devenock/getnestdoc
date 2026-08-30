import { VERSION_METADATA } from '../../constants.js';
/**
 * Sets the version of the endpoint to the passed version
 *
 * @publicApi
 */
export function Version(version) {
    if (Array.isArray(version)) {
        // Drop duplicated versions
        version = Array.from(new Set(version));
    }
    return (target, key, descriptor) => {
        Reflect.defineMetadata(VERSION_METADATA, version, descriptor.value);
        return descriptor;
    };
}
