import { DECORATORS } from '../constants.js';
import { getEnumType, getEnumValues } from '../utils/enum.utils.js';
import { createPropertyDecorator, getTypeIsArrayTuple } from './helpers.js';
const isEnumArray = (opts) => opts.isArray && 'enum' in opts && opts.enum !== undefined;
export function ApiProperty(options = {}) {
    return createApiPropertyDecorator(options);
}
export function createApiPropertyDecorator(options = {}, overrideExisting = true) {
    const [type, isArray] = getTypeIsArrayTuple(options.type, options.isArray);
    options = {
        ...options,
        type,
        isArray
    };
    if (isEnumArray(options)) {
        options.type = 'array';
        const enumValues = getEnumValues(options.enum);
        options.items = {
            type: getEnumType(enumValues),
            enum: enumValues
        };
        delete options.enum;
    }
    else if ('enum' in options && options.enum !== undefined) {
        const enumValues = getEnumValues(options.enum);
        options.enum = enumValues;
        if (!options.type) {
            options.type = getEnumType(enumValues);
        }
    }
    if (Array.isArray(options.type)) {
        const innerType = options.type[0];
        options.type = 'array';
        options.items = {
            type: 'array',
            items: {
                type: typeof innerType === 'function'
                    ? innerType.name.charAt(0).toLowerCase() + innerType.name.slice(1)
                    : innerType
            }
        };
    }
    if (options.pattern instanceof RegExp) {
        options.pattern = options.pattern.source;
    }
    return createPropertyDecorator(DECORATORS.API_MODEL_PROPERTIES, options, overrideExisting);
}
export function ApiPropertyOptional(options = {}) {
    return ApiProperty({
        ...options,
        required: false
    });
}
export function ApiResponseProperty(options = {}) {
    return ApiProperty({
        readOnly: true,
        ...options
    });
}
