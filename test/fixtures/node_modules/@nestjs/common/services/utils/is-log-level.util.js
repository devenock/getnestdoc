import { LOG_LEVELS } from '../logger.service.js';
/**
 * @publicApi
 */
export function isLogLevel(maybeLogLevel) {
    return LOG_LEVELS.includes(maybeLogLevel);
}
