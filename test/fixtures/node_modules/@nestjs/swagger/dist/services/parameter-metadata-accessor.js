import { PARAMTYPES_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum.js';
import { isEmpty, mapValues, omitBy } from 'es-toolkit/compat';
import { reverseObjectKeys } from '../utils/reverse-object-keys.util.js';
const PARAM_TOKEN_PLACEHOLDER = 'placeholder';
export class ParameterMetadataAccessor {
    explore(instance, prototype, method) {
        const types = Reflect.getMetadata(PARAMTYPES_METADATA, instance, method.name);
        if (!types?.length) {
            return undefined;
        }
        const routeArgsMetadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, instance.constructor, method.name) || {};
        const parametersWithType = mapValues(reverseObjectKeys(routeArgsMetadata), (param) => ({
            type: types[param.index],
            name: param.data,
            standardSchema: param.schema,
            required: true
        }));
        const excludePredicate = (val) => val.in === PARAM_TOKEN_PLACEHOLDER || (val.name && val.in === 'body');
        const parameters = omitBy(mapValues(parametersWithType, (val, key) => ({
            ...val,
            in: this.mapParamType(key)
        })), excludePredicate);
        return !isEmpty(parameters) ? parameters : undefined;
    }
    mapParamType(key) {
        const keyPair = key.split(':');
        switch (Number(keyPair[0])) {
            case RouteParamtypes.BODY:
                return 'body';
            case RouteParamtypes.PARAM:
                return 'path';
            case RouteParamtypes.QUERY:
                return 'query';
            case RouteParamtypes.HEADERS:
                return 'header';
            default:
                return PARAM_TOKEN_PLACEHOLDER;
        }
    }
}
