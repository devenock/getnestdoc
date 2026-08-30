import { CUSTOM_ROUTE_ARGS_METADATA } from '../constants.js';
export function assignCustomParameterMetadata(args, paramtype, index, factory, data, schema, ...pipes) {
    return {
        ...args,
        [`${paramtype}${CUSTOM_ROUTE_ARGS_METADATA}:${index}`]: {
            index,
            factory,
            data,
            pipes,
            ...(schema !== undefined && { schema }),
        },
    };
}
