import { iterate } from 'iterare';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { BaseExceptionFilterContext } from './base-exception-filter-context.js';
import { ExternalExceptionsHandler } from './external-exceptions-handler.js';
import { EXCEPTION_FILTERS_METADATA, isEmptyArray, } from '@nestjs/common/internal';
export class ExternalExceptionFilterContext extends BaseExceptionFilterContext {
    config;
    constructor(container, config) {
        super(container);
        this.config = config;
    }
    create(instance, callback, module, contextId = STATIC_CONTEXT, inquirerId) {
        this.moduleContext = module;
        const exceptionHandler = new ExternalExceptionsHandler();
        const filters = this.createContext(instance, callback, EXCEPTION_FILTERS_METADATA, contextId, inquirerId);
        if (isEmptyArray(filters)) {
            return exceptionHandler;
        }
        exceptionHandler.setCustomFilters(filters.reverse());
        return exceptionHandler;
    }
    getGlobalMetadata(contextId = STATIC_CONTEXT, inquirerId) {
        if (!this.config) {
            return [];
        }
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
