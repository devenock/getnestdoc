import { DECORATORS } from '../constants.js';
import { createMixedDecorator } from './helpers.js';
export function ApiCallbacks(...callbackObject) {
    return createMixedDecorator(DECORATORS.API_CALLBACKS, callbackObject);
}
