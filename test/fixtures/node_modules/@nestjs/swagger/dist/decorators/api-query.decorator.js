import { clone, omit } from 'es-toolkit/compat';
import { addEnumArraySchema, addEnumSchema, isEnumArray, isEnumDefined } from '../utils/enum.utils.js';
import { createParamDecorator, getTypeIsArrayTuple } from './helpers.js';
const defaultQueryOptions = {
    name: '',
    required: true
};
export function ApiQuery(options) {
    const apiQueryMetadata = options;
    const [type, isArray] = getTypeIsArrayTuple(apiQueryMetadata.type, apiQueryMetadata.isArray);
    const param = {
        name: 'name' in options ? options.name : defaultQueryOptions.name,
        in: 'query',
        ...omit(options, ['enum', 'extensions']),
        type
    };
    if (isEnumArray(options)) {
        addEnumArraySchema(param, options);
    }
    else if (isEnumDefined(options)) {
        addEnumSchema(param, options);
    }
    if (isArray) {
        param.isArray = isArray;
    }
    const extensions = options.extensions;
    if (extensions && typeof extensions === 'object') {
        const cloned = clone(extensions);
        for (const [key, value] of Object.entries(cloned)) {
            const extKey = key.startsWith('x-') ? key : `x-${key}`;
            param[extKey] = value;
        }
    }
    return createParamDecorator(param, defaultQueryOptions);
}
