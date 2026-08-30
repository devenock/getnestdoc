import { REDIRECT_METADATA } from '../../constants.js';
/**
 * Redirects request to the specified URL.
 *
 * @publicApi
 */
export function Redirect(url = '', statusCode) {
    return (target, key, descriptor) => {
        Reflect.defineMetadata(REDIRECT_METADATA, { statusCode, url }, descriptor.value);
        return descriptor;
    };
}
