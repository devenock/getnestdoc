import { DECORATORS } from '../constants.js';
import { createMixedDecorator } from './helpers.js';
export function ApiProduces(...mimeTypes) {
    return createMixedDecorator(DECORATORS.API_PRODUCES, mimeTypes);
}
