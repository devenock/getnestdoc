import { omit } from 'es-toolkit/compat';
import { addEnumArraySchema, addEnumSchema, isEnumArray, isEnumDefined } from '../utils/enum.utils.js';
import { createParamDecorator, getTypeIsArrayTuple } from './helpers.js';
const defaultBodyMetadata = {
    type: String,
    required: true
};
export function ApiBody(options) {
    const [type, isArray] = getTypeIsArrayTuple(options.type, options.isArray);
    const param = {
        in: 'body',
        ...omit(options, 'enum'),
        type,
        isArray
    };
    if (isEnumArray(options)) {
        addEnumArraySchema(param, options);
    }
    else if (isEnumDefined(options)) {
        addEnumSchema(param, options);
    }
    return createParamDecorator(param, defaultBodyMetadata);
}
