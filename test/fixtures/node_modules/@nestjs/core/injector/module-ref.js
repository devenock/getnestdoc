import { Scope } from '@nestjs/common';
import { getClassScope } from '../helpers/get-class-scope.js';
import { isDurable } from '../helpers/is-durable.js';
import { AbstractInstanceResolver } from './abstract-instance-resolver.js';
import { STATIC_CONTEXT } from './constants.js';
import { Injector } from './injector.js';
import { InstanceLinksHost } from './instance-links-host.js';
import { InstanceWrapper } from './instance-wrapper.js';
export class ModuleRef extends AbstractInstanceResolver {
    container;
    injector;
    _instanceLinksHost;
    get instanceLinksHost() {
        if (!this._instanceLinksHost) {
            this._instanceLinksHost = new InstanceLinksHost(this.container);
        }
        return this._instanceLinksHost;
    }
    constructor(container) {
        super();
        this.container = container;
        const contextOptions = container.contextOptions;
        this.injector = new Injector({
            preview: contextOptions?.preview ?? false,
            snapshot: contextOptions?.snapshot,
            instanceDecorator: contextOptions?.instrument?.instanceDecorator,
        });
    }
    introspect(token) {
        const { wrapperRef } = this.instanceLinksHost.get(token);
        let scope = Scope.DEFAULT;
        if (!wrapperRef.isDependencyTreeStatic()) {
            scope = Scope.REQUEST;
        }
        else if (wrapperRef.isTransient) {
            scope = Scope.TRANSIENT;
        }
        return { scope };
    }
    registerRequestByContextId(request, contextId) {
        this.container.registerRequestProvider(request, contextId);
    }
    async instantiateClass(type, moduleRef, contextId) {
        const wrapper = new InstanceWrapper({
            name: type && type.name,
            metatype: type,
            isResolved: false,
            scope: getClassScope(type),
            durable: isDurable(type),
            host: moduleRef,
        });
        if (type?.prototype) {
            wrapper.setInstanceByContextId(contextId ?? STATIC_CONTEXT, {
                instance: Object.create(type.prototype),
                isResolved: false,
                isPending: false,
            });
        }
        return new Promise((resolve, reject) => {
            const loadInstance = async () => {
                const callback = async (instances) => {
                    const properties = await this.injector.resolveProperties(wrapper, moduleRef, undefined, {
                        contextId: contextId ?? STATIC_CONTEXT,
                        inquirer: wrapper,
                    });
                    const instance = new type(...instances);
                    this.injector.applyProperties(instance, properties);
                    resolve(instance);
                };
                await this.injector.resolveConstructorParams(wrapper, moduleRef, undefined, callback, {
                    contextId: contextId ?? STATIC_CONTEXT,
                    inquirer: wrapper,
                });
            };
            void loadInstance().catch(reject);
        });
    }
}
