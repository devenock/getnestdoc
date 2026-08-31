import { DECORATORS } from '../constants.js';
import { createMixedDecorator } from './helpers.js';
export function ApiConsumes(...mimeTypes) {
    return createMixedDecorator(DECORATORS.API_CONSUMES, mimeTypes);
}
