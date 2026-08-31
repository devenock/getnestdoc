import { clone, isNil, isUndefined, negate, pickBy } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { getEnumType, getEnumValues } from '../utils/enum.utils.js';
import { createClassDecorator, createParamDecorator } from './helpers.js';
const defaultHeaderOptions = {
    name: ''
};
export function ApiHeader(options) {
    const paramSchema = options.content
        ? undefined
        : {
            type: 'string',
            ...(options.example ? { example: options.example } : {}),
            ...(options.schema || {})
        };
    const param = pickBy({
        name: isNil(options.name) ? defaultHeaderOptions.name : options.name,
        in: 'header',
        description: options.description,
        required: options.required,
        deprecated: options.deprecated,
        allowEmptyValue: options.allowEmptyValue,
        style: options.style,
        explode: options.explode,
        allowReserved: options.allowReserved,
        content: options.content,
        examples: options.examples,
        schema: paramSchema
    }, negate(isUndefined));
    if (options.enum) {
        const enumValues = getEnumValues(options.enum);
        param.schema = {
            ...param.schema,
            enum: enumValues,
            type: getEnumType(enumValues)
        };
    }
    const extensions = options.extensions;
    if (extensions && typeof extensions === 'object') {
        const cloned = clone(extensions);
        for (const [key, value] of Object.entries(cloned)) {
            const extKey = key.startsWith('x-') ? key : `x-${key}`;
            param[extKey] = value;
        }
    }
    return (target, key, descriptor) => {
        if (descriptor) {
            return createParamDecorator(param, defaultHeaderOptions)(target, key, descriptor);
        }
        return createClassDecorator(DECORATORS.API_HEADERS, [param])(target);
    };
}
export const ApiHeaders = (headers) => {
    return (target, key, descriptor) => {
        headers.forEach((options) => ApiHeader(options)(target, key, descriptor));
    };
};
