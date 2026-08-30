import { METHOD_METADATA } from '../../constants.js';
import { RequestMethod } from '../../enums/request-method.enum.js';
/**
 * Declares this route as a Server-Sent-Events endpoint
 *
 * @publicApi
 */
export declare function Sse(path?: string, options?: {
    [METHOD_METADATA]?: RequestMethod;
}): MethodDecorator;
