import { RESPONSE_PASSTHROUGH_METADATA, ROUTE_ARGS_METADATA, } from '../../constants.js';
import { RouteParamtypes } from '../../enums/route-paramtypes.enum.js';
import { isNil, isString } from '../../utils/shared.utils.js';
import { isParameterDecoratorOptions } from '../../utils/parameter-decorator-options.util.js';
export function assignMetadata(args, paramtype, index, options, ...legacyPipes) {
    // Callers built against the pre-v12 signature
    // `assignMetadata(args, paramtype, index, data?, ...pipes)` pass the raw
    // `data` value (and pipes positionally); detect that shape and normalize it
    // instead of silently misreading `data` as the options object.
    const isOptionsObject = options !== null &&
        typeof options === 'object' &&
        (isParameterDecoratorOptions(options) || 'data' in options) &&
        !('transform' in options) &&
        legacyPipes.length === 0;
    const normalizedOptions = isOptionsObject
        ? options
        : { data: options, pipes: legacyPipes };
    return {
        ...args,
        [`${paramtype}:${index}`]: {
            index,
            data: normalizedOptions.data,
            pipes: normalizedOptions.pipes ?? [],
            ...(normalizedOptions.schema !== undefined && {
                schema: normalizedOptions.schema,
            }),
        },
    };
}
function createRouteParamDecorator(paramtype) {
    return (data) => (target, key, index) => {
        const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) ||
            {};
        Reflect.defineMetadata(ROUTE_ARGS_METADATA, assignMetadata(args, paramtype, index, {
            data,
        }), target.constructor, key);
    };
}
const createPipesRouteParamDecorator = (paramtype) => ({ data, pipes, schema, }) => (target, key, index) => {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, target.constructor, key) || {};
    const hasParamData = isNil(data) || isString(data);
    const paramData = hasParamData ? data : undefined;
    const paramPipes = hasParamData
        ? (pipes ?? [])
        : [data, ...(pipes ?? [])];
    Reflect.defineMetadata(ROUTE_ARGS_METADATA, assignMetadata(args, paramtype, index, {
        data: paramData,
        pipes: paramPipes,
        schema,
    }), target.constructor, key);
};
/**
 * Route handler parameter decorator. Extracts the `Request`
 * object from the underlying platform and populates the decorated
 * parameter with the value of `Request`.
 *
 * Example: `logout(@Request() req)`
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export const Request = createRouteParamDecorator(RouteParamtypes.REQUEST);
/**
 * Route handler parameter decorator. Extracts the `Response`
 * object from the underlying platform and populates the decorated
 * parameter with the value of `Response`.
 *
 * Example: `logout(@Response() res)`
 *
 * @publicApi
 */
export const Response = (options) => (target, key, index) => {
    if (options?.passthrough) {
        Reflect.defineMetadata(RESPONSE_PASSTHROUGH_METADATA, options?.passthrough, target.constructor, key);
    }
    return createRouteParamDecorator(RouteParamtypes.RESPONSE)()(target, key, index);
};
/**
 * Route handler parameter decorator. Extracts reference to the `Next` function
 * from the underlying platform and populates the decorated
 * parameter with the value of `Next`.
 *
 * @publicApi
 */
export const Next = createRouteParamDecorator(RouteParamtypes.NEXT);
/**
 * Route handler parameter decorator. Extracts the `Ip` property
 * from the `req` object and populates the decorated
 * parameter with the value of `ip`.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export const Ip = createRouteParamDecorator(RouteParamtypes.IP);
/**
 * Route handler parameter decorator. Extracts the `Session` object
 * from the underlying platform and populates the decorated
 * parameter with the value of `Session`.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export const Session = createRouteParamDecorator(RouteParamtypes.SESSION);
/**
 * Route handler parameter decorator. Extracts the `file` object
 * and populates the decorated parameter with the value of `file`.
 * Used in conjunction with
 * [multer middleware](https://github.com/expressjs/multer) for Express-based applications.
 *
 * For example:
 * ```typescript
 * uploadFile(@UploadedFile() file) {
 *   console.log(file);
 * }
 * ```
 * @see [Request object](https://docs.nestjs.com/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFile(fileKey, ...pipes) {
    return createPipesRouteParamDecorator(RouteParamtypes.FILE)({
        data: fileKey,
        pipes,
    });
}
/**
 * Route handler parameter decorator. Extracts the `files` object
 * and populates the decorated parameter with the value of `files`.
 * Used in conjunction with
 * [multer middleware](https://github.com/expressjs/multer) for Express-based applications.
 *
 * For example:
 * ```typescript
 * uploadFile(@UploadedFiles() files) {
 *   console.log(files);
 * }
 * ```
 * @see [Request object](https://docs.nestjs.com/techniques/file-upload)
 *
 * @publicApi
 */
export function UploadedFiles(...pipes) {
    return createPipesRouteParamDecorator(RouteParamtypes.FILES)({
        pipes,
    });
}
/**
 * Route handler parameter decorator. Extracts the `headers`
 * property from the `req` object and populates the decorated
 * parameter with the value of `headers`.
 *
 * For example: `async update(@Headers('Cache-Control') cacheControl: string)`
 *
 * @param property name of single header property to extract.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export const Headers = createRouteParamDecorator(RouteParamtypes.HEADERS);
/**
 * Route handler parameter decorator. Extracts the `query`
 * property from the `req` object and populates the decorated
 * parameter with the value of `query`. May also apply pipes to the bound
 * query parameter.
 *
 * For example:
 * ```typescript
 * async find(@Query('user') user: string)
 * ```
 *
 * @param property name of single property to extract from the `query` object
 * @param optionsOrPipe one or more pipes to apply to the bound query parameter or options object
 * @param pipes one or more pipes to apply to the bound query parameter
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export function Query(property, optionsOrPipe, ...pipes) {
    const isPropertyOptions = isParameterDecoratorOptions(property);
    if (isPropertyOptions) {
        return createPipesRouteParamDecorator(RouteParamtypes.QUERY)({
            pipes: property.pipes,
            schema: property.schema,
        });
    }
    const isOptions = isParameterDecoratorOptions(optionsOrPipe);
    const actualPipes = isOptions
        ? [...(optionsOrPipe.pipes ?? []), ...pipes]
        : [optionsOrPipe, ...pipes].filter(Boolean);
    return createPipesRouteParamDecorator(RouteParamtypes.QUERY)({
        data: property,
        pipes: actualPipes,
        schema: isOptions ? optionsOrPipe.schema : undefined,
    });
}
/**
 * Route handler parameter decorator. Extracts the entire `body` object
 * property, or optionally a named property of the `body` object, from
 * the `req` object and populates the decorated parameter with that value.
 * Also applies pipes to the bound body parameter.
 *
 * For example:
 * ```typescript
 * async create(@Body('role', new ValidationPipe()) role: string)
 * ```
 *
 * @param property name of single property to extract from the `body` object
 * @param optionsOrPipe options to apply to the bound body parameter.
 * @param pipes one or more pipes - either instances or classes - to apply to
 * the bound body parameter.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 * @see [Working with pipes](https://docs.nestjs.com/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Body(property, optionsOrPipe, ...pipes) {
    const isPropertyOptions = isParameterDecoratorOptions(property);
    if (isPropertyOptions) {
        return createPipesRouteParamDecorator(RouteParamtypes.BODY)({
            pipes: property.pipes,
            schema: property.schema,
        });
    }
    const isOptions = isParameterDecoratorOptions(optionsOrPipe);
    const actualPipes = isOptions
        ? [...(optionsOrPipe.pipes ?? []), ...pipes]
        : [optionsOrPipe, ...pipes].filter(Boolean);
    return createPipesRouteParamDecorator(RouteParamtypes.BODY)({
        data: property,
        pipes: actualPipes,
        schema: isOptions ? optionsOrPipe.schema : undefined,
    });
}
/**
 * Route handler parameter decorator. Extracts the `rawBody` Buffer
 * property from the `req` object and populates the decorated parameter with that value.
 * Also applies pipes to the bound rawBody parameter.
 *
 * For example:
 * ```typescript
 * async create(@RawBody(new ValidationPipe()) rawBody: Buffer)
 * ```
 *
 * @param optionsOrPipe one or more pipes to apply or options object
 * @param pipes one or more pipes - either instances or classes - to apply to
 * the bound body parameter.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 * @see [Raw body](https://docs.nestjs.com/faq/raw-body)
 * @see [Working with pipes](https://docs.nestjs.com/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function RawBody(optionsOrPipe, ...pipes) {
    const isOptions = isParameterDecoratorOptions(optionsOrPipe);
    const actualPipes = isOptions
        ? [...(optionsOrPipe.pipes ?? []), ...pipes]
        : [optionsOrPipe, ...pipes].filter(Boolean);
    return createPipesRouteParamDecorator(RouteParamtypes.RAW_BODY)({
        pipes: actualPipes,
        schema: isOptions ? optionsOrPipe.schema : undefined,
    });
}
/**
 * Route handler parameter decorator. Extracts the `params`
 * property from the `req` object and populates the decorated
 * parameter with the value of `params`. May also apply pipes to the bound
 * parameter.
 *
 * For example, extracting all params:
 * ```typescript
 * findOne(@Param() params: string[])
 * ```
 *
 * For example, extracting a single param:
 * ```typescript
 * findOne(@Param('id') id: string)
 * ```
 * @param property name of single property to extract from the `req` object
 * @param optionsOrPipe one or more pipes to apply to the bound parameter or options object
 * @param pipes one or more pipes - either instances or classes - to apply to
 * the bound parameter.
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 * @see [Working with pipes](https://docs.nestjs.com/custom-decorators#working-with-pipes)
 *
 * @publicApi
 */
export function Param(property, optionsOrPipe, ...pipes) {
    const isPropertyOptions = isParameterDecoratorOptions(property);
    if (isPropertyOptions) {
        return createPipesRouteParamDecorator(RouteParamtypes.PARAM)({
            pipes: property.pipes,
            schema: property.schema,
        });
    }
    const isOptions = isParameterDecoratorOptions(optionsOrPipe);
    const actualPipes = isOptions
        ? [...(optionsOrPipe.pipes ?? []), ...pipes]
        : [optionsOrPipe, ...pipes].filter(Boolean);
    return createPipesRouteParamDecorator(RouteParamtypes.PARAM)({
        data: property,
        pipes: actualPipes,
        schema: isOptions ? optionsOrPipe.schema : undefined,
    });
}
/**
 * Route handler parameter decorator. Extracts the `hosts`
 * property from the `req` object and populates the decorated
 * parameter with the value of `params`. May also apply pipes to the bound
 * parameter.
 *
 * For example, extracting all params:
 * ```typescript
 * findOne(@HostParam() params: string[])
 * ```
 *
 * For example, extracting a single param:
 * ```typescript
 * findOne(@HostParam('id') id: string)
 * ```
 * @param property name of single property to extract from the `req` object
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export function HostParam(property) {
    return createRouteParamDecorator(RouteParamtypes.HOST)(property);
}
/**
 * Route handler parameter decorator. Extracts the `Request`
 * object from the underlying platform and populates the decorated
 * parameter with the value of `Request`.
 *
 * Alias for @Request().
 *
 * Example: `logout(@Req() req)`
 *
 * @see [Request object](https://docs.nestjs.com/controllers#request-object)
 *
 * @publicApi
 */
export const Req = Request;
/**
 * Route handler parameter decorator. Extracts the `Response`
 * object from the underlying platform and populates the decorated
 * parameter with the value of `Response`.
 *
 * Alias for @Response().
 *
 * Example: `logout(@Res() res)`
 *
 * @see [Response object](https://docs.nestjs.com/controllers#response-object)
 *
 * @publicApi
 */
export const Res = Response;
