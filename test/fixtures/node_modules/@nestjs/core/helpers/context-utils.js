import { ExecutionContextHost } from './execution-context-host.js';
import { PARAMTYPES_METADATA, RESPONSE_PASSTHROUGH_METADATA, isFunction, } from '@nestjs/common/internal';
export class ContextUtils {
    mapParamType(key) {
        const keyPair = key.split(':');
        return keyPair[0];
    }
    reflectCallbackParamtypes(instance, methodName) {
        return Reflect.getMetadata(PARAMTYPES_METADATA, instance, methodName);
    }
    reflectCallbackMetadata(instance, methodName, metadataKey) {
        return Reflect.getMetadata(metadataKey, instance.constructor, methodName);
    }
    reflectPassthrough(instance, methodName) {
        return Reflect.getMetadata(RESPONSE_PASSTHROUGH_METADATA, instance.constructor, methodName);
    }
    getArgumentsLength(keys, metadata) {
        return keys.length
            ? Math.max(...keys.map(key => metadata[key].index)) + 1
            : 0;
    }
    createNullArray(length) {
        const a = new Array(length);
        for (let i = 0; i < length; ++i)
            a[i] = undefined;
        return a;
    }
    mergeParamsMetatypes(paramsProperties, paramtypes) {
        if (!paramtypes) {
            return paramsProperties;
        }
        return paramsProperties.map(param => ({
            ...param,
            metatype: paramtypes[param.index],
        }));
    }
    getCustomFactory(factory, data, contextFactory) {
        return isFunction(factory)
            ? (...args) => factory(data, contextFactory(args))
            : () => null;
    }
    getContextFactory(contextType, instance, callback) {
        const type = instance && instance.constructor;
        return (args) => {
            const ctx = new ExecutionContextHost(args, type, callback);
            ctx.setType(contextType);
            return ctx;
        };
    }
}
