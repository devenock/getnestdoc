import { iterate } from 'iterare';
import { BaseExceptionFilterContext } from '../exceptions/base-exception-filter-context.js';
import { ExceptionsHandler } from '../exceptions/exceptions-handler.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { EXCEPTION_FILTERS_METADATA, isEmptyArray, } from '@nestjs/common/internal';
export class RouterExceptionFilters extends BaseExceptionFilterContext {
    config;
    applicationRef;
    constructor(container, config, applicationRef) {
        super(container);
        this.config = config;
        this.applicationRef = applicationRef;
    }
    create(instance, callback, moduleKey, contextId = STATIC_CONTEXT, inquirerId) {
        this.moduleContext = moduleKey;
        const exceptionHandler = new ExceptionsHandler(this.applicationRef);
        const filters = this.createContext(instance, callback, EXCEPTION_FILTERS_METADATA, contextId, inquirerId);
        if (isEmptyArray(filters)) {
            return exceptionHandler;
        }
        exceptionHandler.setCustomFilters(filters.reverse());
        return exceptionHandler;
    }
    getGlobalMetadata(contextId = STATIC_CONTEXT, inquirerId) {
        const globalFilters = this.config.getGlobalFilters();
        if (contextId === STATIC_CONTEXT && !inquirerId) {
            return globalFilters;
        }
        const scopedFilterWrappers = this.config.getGlobalRequestFilters();
        const scopedFilters = iterate(scopedFilterWrappers)
            .map(wrapper => wrapper.getInstanceByContextId(contextId, inquirerId))
            .filter(host => !!host)
            .map(host => host.instance)
            .toArray();
        return globalFilters.concat(scopedFilters);
    }
}
