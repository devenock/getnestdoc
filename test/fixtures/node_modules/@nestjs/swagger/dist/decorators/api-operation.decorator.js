import { isUndefined, negate, pickBy } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { createMethodDecorator } from './helpers.js';
const defaultOperationOptions = {
    summary: ''
};
export function ApiOperation(options, { overrideExisting } = { overrideExisting: true }) {
    return createMethodDecorator(DECORATORS.API_OPERATION, pickBy({
        ...defaultOperationOptions,
        ...options
    }, negate(isUndefined)), { overrideExisting });
}
