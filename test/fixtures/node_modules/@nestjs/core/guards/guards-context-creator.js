import { iterate } from 'iterare';
import { ContextCreator } from '../helpers/context-creator.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { GUARDS_METADATA, isEmpty, isFunction, } from '@nestjs/common/internal';
export class GuardsContextCreator extends ContextCreator {
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
        return this.createContext(instance, callback, GUARDS_METADATA, contextId, inquirerId);
    }
    createConcreteContext(metadata, contextId = STATIC_CONTEXT, inquirerId) {
        if (isEmpty(metadata)) {
            return [];
        }
        return iterate(metadata)
            .filter((guard) => guard && (guard.name || guard.canActivate))
            .map(guard => this.getGuardInstance(guard, contextId, inquirerId))
            .filter((guard) => !!guard && isFunction(guard.canActivate))
            .toArray();
    }
    getGuardInstance(metatype, contextId = STATIC_CONTEXT, inquirerId) {
        const isObject = !!metatype.canActivate;
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
        const injectables = moduleRef.injectables;
        return injectables.get(metatype);
    }
    getGlobalMetadata(contextId = STATIC_CONTEXT, inquirerId) {
        if (!this.config) {
            return [];
        }
        const globalGuards = this.config.getGlobalGuards();
        if (contextId === STATIC_CONTEXT && !inquirerId) {
            return globalGuards;
        }
        const scopedGuardWrappers = this.config.getGlobalRequestGuards();
        const scopedGuards = iterate(scopedGuardWrappers)
            .map(wrapper => wrapper.getInstanceByContextId(this.getContextId(contextId, wrapper), inquirerId))
            .filter(host => !!host)
            .map(host => host.instance)
            .toArray();
        return globalGuards.concat(scopedGuards);
    }
}
