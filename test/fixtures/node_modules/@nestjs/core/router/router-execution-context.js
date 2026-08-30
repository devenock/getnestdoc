import { ForbiddenException, SSE_ABORT_CONTROLLER, } from '@nestjs/common';
import { CUSTOM_ROUTE_ARGS_METADATA, HEADERS_METADATA, HTTP_CODE_METADATA, isEmptyArray, isString, REDIRECT_METADATA, RENDER_METADATA, ROUTE_ARGS_METADATA, RouteParamtypes, SSE_METADATA, } from '@nestjs/common/internal';
import { FORBIDDEN_MESSAGE, } from '../guards/index.js';
import { ContextUtils } from '../helpers/context-utils.js';
import { HandlerMetadataStorage, } from '../helpers/handler-metadata-storage.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { RouterResponseController, } from './router-response-controller.js';
export class RouterExecutionContext {
    paramsFactory;
    pipesContextCreator;
    pipesConsumer;
    guardsContextCreator;
    guardsConsumer;
    interceptorsContextCreator;
    interceptorsConsumer;
    applicationRef;
    handlerMetadataStorage = new HandlerMetadataStorage();
    contextUtils = new ContextUtils();
    responseController;
    constructor(paramsFactory, pipesContextCreator, pipesConsumer, guardsContextCreator, guardsConsumer, interceptorsContextCreator, interceptorsConsumer, applicationRef) {
        this.paramsFactory = paramsFactory;
        this.pipesContextCreator = pipesContextCreator;
        this.pipesConsumer = pipesConsumer;
        this.guardsContextCreator = guardsContextCreator;
        this.guardsConsumer = guardsConsumer;
        this.interceptorsContextCreator = interceptorsContextCreator;
        this.interceptorsConsumer = interceptorsConsumer;
        this.applicationRef = applicationRef;
        this.responseController = new RouterResponseController(applicationRef);
    }
    create(instance, callback, methodName, moduleKey, requestMethod, contextId = STATIC_CONTEXT, inquirerId) {
        const contextType = 'http';
        const { argsLength, fnHandleResponse, isSseHandler, paramtypes, getParamsMetadata, httpStatusCode, responseHeaders, hasCustomHeaders, } = this.getMetadata(instance, callback, methodName, moduleKey, requestMethod, contextType);
        const paramsOptions = this.contextUtils.mergeParamsMetatypes(getParamsMetadata(moduleKey, contextId, inquirerId), paramtypes);
        const pipes = this.pipesContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const guards = this.guardsContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const interceptors = this.interceptorsContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const fnCanActivate = this.createGuardsFn(guards, instance, callback, contextType);
        const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);
        const handler = (args, req, res, next) => async () => {
            fnApplyPipes && (await fnApplyPipes(args, req, res, next));
            return callback.apply(instance, args);
        };
        return async (req, res, next) => {
            const args = this.contextUtils.createNullArray(argsLength);
            fnCanActivate && (await fnCanActivate([req, res, next]));
            this.responseController.setStatus(res, httpStatusCode);
            hasCustomHeaders &&
                this.responseController.setHeaders(res, responseHeaders);
            if (isSseHandler) {
                // Attach a per-request AbortController before the handler runs so async
                // @Sse() handlers can observe client disconnects via @SseSignal() during
                // their setup. The controller is aborted in RouterResponseController.sse()
                // when the underlying connection closes.
                this.attachSseAbortSignal(req);
            }
            const resultOrDeferred = this.interceptorsConsumer.intercept(interceptors, [req, res, next], instance, callback, handler(args, req, res, next), contextType);
            const result = isSseHandler ? resultOrDeferred : await resultOrDeferred;
            await fnHandleResponse(result, res, req);
        };
    }
    getMetadata(instance, callback, methodName, moduleKey, requestMethod, contextType) {
        const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
        if (cacheMetadata) {
            return cacheMetadata;
        }
        const metadata = this.contextUtils.reflectCallbackMetadata(instance, methodName, ROUTE_ARGS_METADATA) || {};
        const keys = Object.keys(metadata);
        const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
        const paramtypes = this.contextUtils.reflectCallbackParamtypes(instance, methodName);
        const contextFactory = this.contextUtils.getContextFactory(contextType, instance, callback);
        const getParamsMetadata = (moduleKey, contextId = STATIC_CONTEXT, inquirerId) => this.exchangeKeysForValues(keys, metadata, moduleKey, contextId, inquirerId, contextFactory);
        const paramsMetadata = getParamsMetadata(moduleKey);
        const isResponseHandled = this.isResponseHandled(instance, methodName, paramsMetadata);
        const httpRedirectResponse = this.reflectRedirect(callback);
        const fnHandleResponse = this.createHandleResponseFn(callback, isResponseHandled, httpRedirectResponse);
        const isSseHandler = !!this.reflectSse(callback);
        const httpCode = this.reflectHttpStatusCode(callback);
        const httpStatusCode = httpCode ?? this.responseController.getStatusByMethod(requestMethod);
        const responseHeaders = this.reflectResponseHeaders(callback);
        const hasCustomHeaders = !isEmptyArray(responseHeaders);
        const handlerMetadata = {
            argsLength,
            fnHandleResponse,
            isSseHandler,
            paramtypes,
            getParamsMetadata,
            httpStatusCode,
            hasCustomHeaders,
            responseHeaders,
        };
        this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
        return handlerMetadata;
    }
    reflectRedirect(callback) {
        return Reflect.getMetadata(REDIRECT_METADATA, callback);
    }
    reflectHttpStatusCode(callback) {
        return Reflect.getMetadata(HTTP_CODE_METADATA, callback);
    }
    reflectRenderTemplate(callback) {
        return Reflect.getMetadata(RENDER_METADATA, callback);
    }
    reflectResponseHeaders(callback) {
        return Reflect.getMetadata(HEADERS_METADATA, callback) || [];
    }
    reflectSse(callback) {
        return Reflect.getMetadata(SSE_METADATA, callback);
    }
    exchangeKeysForValues(keys, metadata, moduleContext, contextId = STATIC_CONTEXT, inquirerId, contextFactory) {
        this.pipesContextCreator.setModuleContext(moduleContext);
        return keys.map(key => {
            const { index, data, pipes: pipesCollection, schema } = metadata[key];
            const pipes = this.pipesContextCreator.createConcreteContext(pipesCollection, contextId, inquirerId);
            const type = this.contextUtils.mapParamType(key);
            if (key.includes(CUSTOM_ROUTE_ARGS_METADATA)) {
                const { factory } = metadata[key];
                const customExtractValue = this.contextUtils.getCustomFactory(factory, data, contextFactory);
                return {
                    index,
                    extractValue: customExtractValue,
                    type,
                    data,
                    pipes,
                    schema,
                };
            }
            const numericType = Number(type);
            const extractValue = (req, res, next) => this.paramsFactory.exchangeKeyForValue(numericType, data, {
                req: req,
                res,
                next,
            });
            return { index, extractValue, type: numericType, data, pipes, schema };
        });
    }
    async getParamValue(value, metadata, pipes) {
        if (!isEmptyArray(pipes)) {
            return this.pipesConsumer.apply(value, metadata, pipes);
        }
        return value;
    }
    isPipeable(type) {
        return (type === RouteParamtypes.BODY ||
            type === RouteParamtypes.RAW_BODY ||
            type === RouteParamtypes.QUERY ||
            type === RouteParamtypes.PARAM ||
            type === RouteParamtypes.FILE ||
            type === RouteParamtypes.FILES ||
            isString(type));
    }
    createGuardsFn(guards, instance, callback, contextType) {
        const canActivateFn = async (args) => {
            const canActivate = await this.guardsConsumer.tryActivate(guards, args, instance, callback, contextType);
            if (!canActivate) {
                throw new ForbiddenException(FORBIDDEN_MESSAGE);
            }
        };
        return guards.length ? canActivateFn : null;
    }
    createPipesFn(pipes, paramsOptions) {
        const pipesFn = async (args, req, res, next) => {
            const resolveParamValue = async (param) => {
                const { index, extractValue, type, data, metatype, pipes: paramPipes, schema, } = param;
                const value = extractValue(req, res, next);
                args[index] = this.isPipeable(type)
                    ? await this.getParamValue(value, { metatype, type, data, schema }, pipes.concat(paramPipes))
                    : value;
            };
            await Promise.all(paramsOptions.map(resolveParamValue));
        };
        return paramsOptions.length ? pipesFn : null;
    }
    createHandleResponseFn(callback, isResponseHandled, redirectResponse, httpStatusCode) {
        const renderTemplate = this.reflectRenderTemplate(callback);
        if (renderTemplate) {
            return async (result, res) => {
                return await this.responseController.render(result, res, renderTemplate);
            };
        }
        if (redirectResponse && isString(redirectResponse.url)) {
            return async (result, res) => {
                await this.responseController.redirect(result, res, redirectResponse);
            };
        }
        const isSseHandler = !!this.reflectSse(callback);
        if (isSseHandler) {
            return async (result, res, req) => {
                const rawResponse = res.raw ?? res;
                await this.responseController.sse(result, rawResponse, req.raw || req, {
                    additionalHeaders: res.getHeaders?.(),
                    statusCode: res.statusCode ??
                        rawResponse.statusCode,
                });
            };
        }
        return async (result, res) => {
            result = await this.responseController.transformToResult(result);
            !isResponseHandled &&
                (await this.responseController.apply(result, res, httpStatusCode));
            return res;
        };
    }
    isResponseHandled(instance, methodName, paramsMetadata) {
        const hasResponseOrNextDecorator = paramsMetadata.some(({ type }) => type === RouteParamtypes.RESPONSE || type === RouteParamtypes.NEXT);
        const isPassthroughEnabled = this.contextUtils.reflectPassthrough(instance, methodName);
        return hasResponseOrNextDecorator && !isPassthroughEnabled;
    }
    attachSseAbortSignal(req) {
        const carrier = req;
        // Attach to both the framework request and its raw form (when present), since
        // @SseSignal() reads from the execution-context request while
        // RouterResponseController.sse() operates on the raw request.
        if (!carrier[SSE_ABORT_CONTROLLER]) {
            carrier[SSE_ABORT_CONTROLLER] = new AbortController();
        }
        if (carrier.raw && !carrier.raw[SSE_ABORT_CONTROLLER]) {
            carrier.raw[SSE_ABORT_CONTROLLER] =
                carrier[SSE_ABORT_CONTROLLER];
        }
    }
}
