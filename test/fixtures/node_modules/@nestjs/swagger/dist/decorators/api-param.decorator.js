import { clone, isNil, omit } from 'es-toolkit/compat';
import { addEnumSchema, isEnumDefined } from '../utils/enum.utils.js';
import { createParamDecorator } from './helpers.js';
const defaultParamOptions = {
    name: '',
    required: true
};
export function ApiParam(options) {
    const param = {
        name: isNil(options.name) ? defaultParamOptions.name : options.name,
        in: 'path',
        ...omit(options, ['enum', 'extensions'])
    };
    if (isEnumDefined(options)) {
        addEnumSchema(param, options);
    }
    const extensions = options.extensions;
    if (extensions && typeof extensions === 'object') {
        const cloned = clone(extensions);
        for (const [key, value] of Object.entries(cloned)) {
            const extKey = key.startsWith('x-') ? key : `x-${key}`;
            param[extKey] = value;
        }
    }
    return createParamDecorator(param, defaultParamOptions);
}
