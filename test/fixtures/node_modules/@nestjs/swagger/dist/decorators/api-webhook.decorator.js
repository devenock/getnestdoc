import { DECORATORS } from '../constants.js';
import { createMethodDecorator } from './helpers.js';
export function ApiWebhook(name) {
    return createMethodDecorator(DECORATORS.API_WEBHOOK, name ?? true);
}
