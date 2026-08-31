import { DECORATORS } from '../constants.js';
import { createClassDecorator } from './helpers.js';
export function ApiSchema(options) {
    return createClassDecorator(DECORATORS.API_SCHEMA, [options]);
}
