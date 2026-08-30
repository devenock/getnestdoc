import { METHOD_METADATA, PATH_METADATA, SSE_METADATA, } from '../../constants.js';
import { RequestMethod } from '../../enums/request-method.enum.js';
/**
 * Declares this route as a Server-Sent-Events endpoint
 *
 * @publicApi
 */
export function Sse(path, options = {
    [METHOD_METADATA]: RequestMethod.GET,
}) {
    return (target, key, descriptor) => {
        path = path && path.length ? path : '/';
        Reflect.defineMetadata(PATH_METADATA, path, descriptor.value);
        Reflect.defineMetadata(METHOD_METADATA, options[METHOD_METADATA], descriptor.value);
        Reflect.defineMetadata(SSE_METADATA, true, descriptor.value);
        return descriptor;
    };
}
