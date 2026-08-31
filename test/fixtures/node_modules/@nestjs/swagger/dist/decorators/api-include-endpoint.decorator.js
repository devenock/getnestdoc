import { DECORATORS } from '../constants.js';
import { createMethodDecorator } from './helpers.js';
export function ApiIncludeEndpoint(disable = true) {
    return createMethodDecorator(DECORATORS.API_INCLUDE_ENDPOINT, {
        disable
    });
}
