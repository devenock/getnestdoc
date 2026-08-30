import { uid } from 'uid';
import { ROUTE_ARGS_METADATA } from '../../constants.js';
import { assignCustomParameterMetadata } from '../../utils/assign-custom-metadata.util.js';
import { isFunction, isNil } from '../../utils/shared.utils.js';
import { isParameterDecoratorOptions } from '../../utils/parameter-decorator-options.util.js';
/**
 * Defines route param decorator
 *
 * @param factory
 * @param enhancers
 *
 * @publicApi
 */
export function createParamDecorator(factory, enhancers = []) {
    const paramtype = uid(21);
    return (data, ...pipes) => (target, key, index) => {
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) ||
            {};
        const isPipe = (pipe) => pipe &&
            ((isFunction(pipe) &&
                pipe.prototype &&
                isFunction(pipe.prototype.transform)) ||
                isFunction(pipe.transform));
        const hasParamData = isNil(data) || !isPipe(data);
        const paramData = hasParamData ? data : undefined;
        const paramPipes = hasParamData ? pipes : [data, ...pipes];
        // Check if data itself is an options object (when used as the first argument)
        const isDataOptions = hasParamData && !isNil(data) && isParameterDecoratorOptions(data);
        // Check if the last pipe argument is actually an options object
        const lastPipeArg = paramPipes.length > 0 ? paramPipes[paramPipes.length - 1] : undefined;
        const isLastPipeOptions = !isDataOptions && isParameterDecoratorOptions(lastPipeArg);
        let finalData;
        let finalSchema;
        let finalPipes;
        if (isDataOptions) {
            const opts = data;
            finalData = undefined;
            finalSchema = opts.schema;
            // Merge positional pipes passed after the options object
            finalPipes = [...(opts.pipes ?? []), ...paramPipes];
        }
        else if (isLastPipeOptions) {
            const opts = lastPipeArg;
            finalData = paramData;
            finalSchema = opts.schema;
            finalPipes = [
                ...paramPipes.slice(0, -1),
                ...(opts.pipes ?? []),
            ];
        }
        else {
            finalData = paramData;
            finalSchema = undefined;
            finalPipes = paramPipes;
        }
        Reflect.defineMetadata(ROUTE_ARGS_METADATA, assignCustomParameterMetadata(args, paramtype, index, factory, finalData, finalSchema, ...finalPipes), target.constructor, key);
        enhancers.forEach(fn => fn(target, key, index));
    };
}
