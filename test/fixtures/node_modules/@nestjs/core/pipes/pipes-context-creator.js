import { iterate } from 'iterare';
import { ContextCreator } from '../helpers/context-creator.js';
import { STATIC_CONTEXT } from '../injector/constants.js';
import { PIPES_METADATA, isEmpty, isFunction, } from '@nestjs/common/internal';
export class PipesContextCreator extends ContextCreator {
    container;
    config;
    moduleContext;
    constructor(container, config) {
        super();
        this.container = container;
        this.config = config;
    }
    create(instance, callback, moduleKey, contextId = STATIC_CONTEXT, inquirerId) {
        this.moduleContext = moduleKey;
        return this.createContext(instance, callback, PIPES_METADATA, contextId, inquirerId);
    }
    createConcreteContext(metadata, contextId = STATIC_CONTEXT, inquirerId) {
        if (isEmpty(metadata)) {
            return [];
        }
        return iterate(metadata)
            .filter((pipe) => pipe && (pipe.name || pipe.transform))
            .map(pipe => this.getPipeInstance(pipe, contextId, inquirerId))
            .filter(pipe => !!pipe && pipe.transform && isFunction(pipe.transform))
            .toArray();
    }
    getPipeInstance(pipe, contextId = STATIC_CONTEXT, inquirerId) {
        const isObject = !!pipe.transform;
        if (isObject) {
            return pipe;
        }
        const instanceWrapper = this.getInstanceByMetatype(pipe);
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
        const globalPipes = this.config.getGlobalPipes();
        if (contextId === STATIC_CONTEXT && !inquirerId) {
            return globalPipes;
        }
        const scopedPipeWrappers = this.config.getGlobalRequestPipes();
        const scopedPipes = iterate(scopedPipeWrappers)
            .map(wrapper => wrapper.getInstanceByContextId(this.getContextId(contextId, wrapper), inquirerId))
            .filter(host => !!host)
            .map(host => host.instance)
            .toArray();
        return globalPipes.concat(scopedPipes);
    }
    setModuleContext(context) {
        this.moduleContext = context;
    }
}
