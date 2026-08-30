import { ForbiddenException, } from '@nestjs/common';
import { CUSTOM_ROUTE_ARGS_METADATA, isEmptyArray, } from '@nestjs/common/internal';
import { isObservable, lastValueFrom } from 'rxjs';
import { ExternalExceptionFilterContext } from '../exceptions/external-exception-filter-context.js';
import { FORBIDDEN_MESSAGE } from '../guards/constants.js';
import { GuardsConsumer, GuardsContextCreator } from '../guards/index.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { InterceptorsConsumer, InterceptorsContextCreator, } from '../interceptors/index.js';
import { PipesConsumer, PipesContextCreator } from '../pipes/index.js';
import { ContextUtils } from './context-utils.js';
import { ExternalErrorProxy } from './external-proxy.js';
import { HandlerMetadataStorage } from './handler-metadata-storage.js';
export class ExternalContextCreator {
    guardsContextCreator;
    guardsConsumer;
    interceptorsContextCreator;
    interceptorsConsumer;
    modulesContainer;
    pipesContextCreator;
    pipesConsumer;
    filtersContextCreator;
    contextUtils = new ContextUtils();
    externalErrorProxy = new ExternalErrorProxy();
    handlerMetadataStorage = new HandlerMetadataStorage();
    container;
    constructor(guardsContextCreator, guardsConsumer, interceptorsContextCreator, interceptorsConsumer, modulesContainer, pipesContextCreator, pipesConsumer, filtersContextCreator) {
        this.guardsContextCreator = guardsContextCreator;
        this.guardsConsumer = guardsConsumer;
        this.interceptorsContextCreator = interceptorsContextCreator;
        this.interceptorsConsumer = interceptorsConsumer;
        this.modulesContainer = modulesContainer;
        this.pipesContextCreator = pipesContextCreator;
        this.pipesConsumer = pipesConsumer;
        this.filtersContextCreator = filtersContextCreator;
    }
    static fromContainer(container) {
        const guardsContextCreator = new GuardsContextCreator(container, container.applicationConfig);
        const guardsConsumer = new GuardsConsumer();
        const interceptorsContextCreator = new InterceptorsContextCreator(container, container.applicationConfig);
        const interceptorsConsumer = new InterceptorsConsumer();
        const pipesContextCreator = new PipesContextCreator(container, container.applicationConfig);
        const pipesConsumer = new PipesConsumer();
        const filtersContextCreator = new ExternalExceptionFilterContext(container, container.applicationConfig);
        const externalContextCreator = new ExternalContextCreator(guardsContextCreator, guardsConsumer, interceptorsContextCreator, interceptorsConsumer, container.getModules(), pipesContextCreator, pipesConsumer, filtersContextCreator);
        externalContextCreator.container = container;
        return externalContextCreator;
    }
    create(instance, callback, methodName, metadataKey, paramsFactory, contextId = STATIC_CONTEXT, inquirerId, options = {
        interceptors: true,
        guards: true,
        filters: true,
    }, contextType = 'http') {
        const moduleKey = this.getContextModuleKey(instance.constructor);
        const { argsLength, paramtypes, getParamsMetadata } = this.getMetadata(instance, methodName, metadataKey, paramsFactory, contextType);
        const pipes = this.pipesContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const guards = this.guardsContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const exceptionFilter = this.filtersContextCreator.create(instance, callback, moduleKey, contextId, inquirerId);
        const interceptors = options.interceptors
            ? this.interceptorsContextCreator.create(instance, callback, moduleKey, contextId, inquirerId)
            : [];
        const paramsMetadata = getParamsMetadata(moduleKey, contextId, inquirerId);
        const paramsOptions = paramsMetadata
            ? this.contextUtils.mergeParamsMetatypes(paramsMetadata, paramtypes)
            : [];
        const fnCanActivate = options.guards
            ? this.createGuardsFn(guards, instance, callback, contextType)
            : null;
        const fnApplyPipes = this.createPipesFn(pipes, paramsOptions);
        const handler = (initialArgs, ...args) => async () => {
            if (fnApplyPipes) {
                await fnApplyPipes(initialArgs, ...args);
                return callback.apply(instance, initialArgs);
            }
            return callback.apply(instance, args);
        };
        const target = async (...args) => {
            const initialArgs = this.contextUtils.createNullArray(argsLength);
            fnCanActivate && (await fnCanActivate(args));
            const result = await this.interceptorsConsumer.intercept(interceptors, args, instance, callback, handler(initialArgs, ...args), contextType);
            return this.transformToResult(result);
        };
        return options.filters
            ? this.externalErrorProxy.createProxy(target, exceptionFilter, contextType)
            : target;
    }
    getMetadata(instance, methodName, metadataKey, paramsFactory, contextType) {
        const cacheMetadata = this.handlerMetadataStorage.get(instance, methodName);
        if (cacheMetadata) {
            return cacheMetadata;
        }
        const metadata = this.contextUtils.reflectCallbackMetadata(instance, methodName, metadataKey || '') || {};
        const keys = Object.keys(metadata);
        const argsLength = this.contextUtils.getArgumentsLength(keys, metadata);
        const paramtypes = this.contextUtils.reflectCallbackParamtypes(instance, methodName);
        const contextFactory = this.contextUtils.getContextFactory(contextType, instance, instance[methodName]);
        const getParamsMetadata = (moduleKey, contextId = STATIC_CONTEXT, inquirerId) => paramsFactory
            ? this.exchangeKeysForValues(keys, metadata, moduleKey, paramsFactory, contextId, inquirerId, contextFactory)
            : null;
        const handlerMetadata = {
            argsLength,
            paramtypes,
            getParamsMetadata: getParamsMetadata,
        };
        this.handlerMetadataStorage.set(instance, methodName, handlerMetadata);
        return handlerMetadata;
    }
    getContextModuleKey(moduleCtor) {
        const emptyModuleKey = '';
        if (!moduleCtor) {
            return emptyModuleKey;
        }
        const moduleContainerEntries = this.modulesContainer.entries();
        for (const [key, moduleRef] of moduleContainerEntries) {
            if (moduleRef.hasProvider(moduleCtor)) {
                return key;
            }
        }
        return emptyModuleKey;
    }
    exchangeKeysForValues(keys, metadata, moduleContext, paramsFactory, contextId = STATIC_CONTEXT, inquirerId, contextFactory = this.contextUtils.getContextFactory('http')) {
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
            const extractValue = (...args) => paramsFactory.exchangeKeyForValue(numericType, data, args);
            return { index, extractValue, type: numericType, data, pipes, schema };
        });
    }
    createPipesFn(pipes, paramsOptions) {
        const pipesFn = async (args, ...params) => {
            const resolveParamValue = async (param) => {
                const { index, extractValue, type, data, metatype, pipes: paramPipes, schema, } = param;
                const value = extractValue(...params);
                args[index] = await this.getParamValue(value, { metatype, type, data, schema }, pipes.concat(paramPipes));
            };
            await Promise.all(paramsOptions.map(resolveParamValue));
        };
        return paramsOptions.length ? pipesFn : null;
    }
    async getParamValue(value, metadata, pipes) {
        return isEmptyArray(pipes)
            ? value
            : this.pipesConsumer.apply(value, metadata, pipes);
    }
    async transformToResult(resultOrDeferred) {
        if (isObservable(resultOrDeferred)) {
            return lastValueFrom(resultOrDeferred);
        }
        return resultOrDeferred;
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
    registerRequestProvider(request, contextId) {
        this.container.registerRequestProvider(request, contextId);
    }
}
