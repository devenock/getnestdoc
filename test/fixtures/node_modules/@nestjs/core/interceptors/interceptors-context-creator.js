import { iterate } from 'iterare';
import { ContextCreator } from '../helpers/context-creator.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { INTERCEPTORS_METADATA, isEmpty, isFunction, } from '@nestjs/common/internal';
export class InterceptorsContextCreator extends ContextCreator {
    container;
    config;
    moduleContext;
    constructor(container, config) {
        super();
        this.container = container;
        this.config = config;
    }
    create(instance, callback, module, contextId = STATIC_CONTEXT, inquirerId) {
        this.moduleContext = module;
        return this.createContext(instance, callback, INTERCEPTORS_METADATA, contextId, inquirerId);
    }
    createConcreteContext(metadata, contextId = STATIC_CONTEXT, inquirerId) {
        if (isEmpty(metadata)) {
            return [];
        }
        return iterate(metadata)
            .filter(interceptor => interceptor && (interceptor.name || interceptor.intercept))
            .map(interceptor => this.getInterceptorInstance(interceptor, contextId, inquirerId))
            .filter((interceptor) => interceptor ? isFunction(interceptor.intercept) : false)
            .toArray();
    }
    getInterceptorInstance(metatype, contextId = STATIC_CONTEXT, inquirerId) {
        const isObject = !!metatype.intercept;
        if (isObject) {
            return metatype;
        }
        const instanceWrapper = this.getInstanceByMetatype(metatype);
        if (!instanceWrapper) {
            return null;
        }
        const instanceHost = instanceWrapper.getInstanceByContextId(this.getContextId(contextId, instanceWrapper), inquirerId);
        return instanceHost && instanceHost.instance;
    }
    getInstanceByMetatype(metatype) {
        if (!this.moduleContext) {
            return;
        }
        const collection = this.container.getModules();
        const moduleRef = collection.get(this.moduleContext);
        if (!moduleRef) {
            return;
        }
        return moduleRef.injectables.get(metatype);
    }
    getGlobalMetadata(contextId = STATIC_CONTEXT, inquirerId) {
        if (!this.config) {
            return [];
        }
        const globalInterceptors = this.config.getGlobalInterceptors();
        if (contextId === STATIC_CONTEXT && !inquirerId) {
            return globalInterceptors;
        }
        const scopedInterceptorWrappers = this.config.getGlobalRequestInterceptors();
        const scopedInterceptors = iterate(scopedInterceptorWrappers)
            .map(wrapper => wrapper.getInstanceByContextId(this.getContextId(contextId, wrapper), inquirerId))
            .filter(host => !!host)
            .map(host => host.instance)
            .toArray();
        return globalInterceptors.concat(scopedInterceptors);
    }
}
