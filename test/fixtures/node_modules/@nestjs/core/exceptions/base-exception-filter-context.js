import { iterate } from 'iterare';
import { ContextCreator } from '../helpers/context-creator.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { FILTER_CATCH_EXCEPTIONS, isEmpty, isFunction, } from '@nestjs/common/internal';
export class BaseExceptionFilterContext extends ContextCreator {
    container;
    moduleContext;
    constructor(container) {
        super();
        this.container = container;
    }
    createConcreteContext(metadata, contextId = STATIC_CONTEXT, inquirerId) {
        if (isEmpty(metadata)) {
            return [];
        }
        return iterate(metadata)
            .filter(instance => instance && (isFunction(instance.catch) || instance.name))
            .map(filter => this.getFilterInstance(filter, contextId, inquirerId))
            .filter(item => !!item)
            .map(instance => ({
            func: instance.catch.bind(instance),
            exceptionMetatypes: this.reflectCatchExceptions(instance),
        }))
            .toArray();
    }
    getFilterInstance(filter, contextId = STATIC_CONTEXT, inquirerId) {
        const isObject = !!filter.catch;
        if (isObject) {
            return filter;
        }
        const instanceWrapper = this.getInstanceByMetatype(filter);
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
    reflectCatchExceptions(instance) {
        const prototype = Object.getPrototypeOf(instance);
        return (Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, prototype.constructor) || []);
    }
}
