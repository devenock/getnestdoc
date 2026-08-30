import { Scope } from '@nestjs/common';
import { InvalidClassScopeException, UnknownElementException, } from '../errors/exceptions/index.js';
export class AbstractInstanceResolver {
    find(typeOrToken, options) {
        const instanceLinkOrArray = this.instanceLinksHost.get(typeOrToken, options);
        const pluckInstance = ({ wrapperRef }) => {
            if (wrapperRef.scope === Scope.REQUEST ||
                wrapperRef.scope === Scope.TRANSIENT ||
                !wrapperRef.isDependencyTreeStatic()) {
                throw new InvalidClassScopeException(typeOrToken);
            }
            return wrapperRef.instance;
        };
        if (Array.isArray(instanceLinkOrArray)) {
            return instanceLinkOrArray.map(pluckInstance);
        }
        return pluckInstance(instanceLinkOrArray);
    }
    async resolvePerContext(typeOrToken, contextModule, contextId, options) {
        const instanceLinkOrArray = options?.strict
            ? this.instanceLinksHost.get(typeOrToken, {
                moduleId: contextModule.id,
                each: options.each,
            })
            : this.instanceLinksHost.get(typeOrToken, {
                each: options?.each,
            });
        const pluckInstance = async (instanceLink) => {
            const { wrapperRef, collection } = instanceLink;
            if (wrapperRef.isDependencyTreeStatic() && !wrapperRef.isTransient) {
                return wrapperRef.instance;
            }
            const ctorHost = wrapperRef.instance || { constructor: typeOrToken };
            const instance = await this.injector.loadPerContext(ctorHost, wrapperRef.host, collection, contextId, wrapperRef);
            if (!instance) {
                throw new UnknownElementException();
            }
            return instance;
        };
        if (Array.isArray(instanceLinkOrArray)) {
            return Promise.all(instanceLinkOrArray.map(instanceLink => pluckInstance(instanceLink)));
        }
        return pluckInstance(instanceLinkOrArray);
    }
}
