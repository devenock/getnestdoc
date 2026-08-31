import { isFunction } from 'es-toolkit/compat';
import { BUILT_IN_TYPES } from '../services/constants.js';
export function isBuiltInType(type) {
    return isFunction(type) && BUILT_IN_TYPES.some((item) => item === type);
}
