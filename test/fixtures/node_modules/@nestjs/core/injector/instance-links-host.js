import { UnknownElementException } from '../errors/exceptions/unknown-element.exception.js';
import { isFunction } from '@nestjs/common/internal';
export class InstanceLinksHost {
    container;
    instanceLinks = new Map();
    constructor(container) {
        this.container = container;
        this.initialize();
    }
    get(token, options = {}) {
        const instanceLinksForGivenToken = this.instanceLinks.get(token);
        if (!instanceLinksForGivenToken) {
            throw new UnknownElementException(this.getInstanceNameByToken(token));
        }
        if (options.each) {
            return instanceLinksForGivenToken;
        }
        const instanceLink = options.moduleId
            ? instanceLinksForGivenToken.find(item => item.moduleId === options.moduleId)
            : instanceLinksForGivenToken[instanceLinksForGivenToken.length - 1];
        if (!instanceLink) {
            throw new UnknownElementException(this.getInstanceNameByToken(token));
        }
        return instanceLink;
    }
    initialize() {
        const modules = this.container.getModules();
        modules.forEach(moduleRef => {
            const { providers, injectables, controllers } = moduleRef;
            providers.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'providers'));
            injectables.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'injectables'));
            controllers.forEach((wrapper, token) => this.addLink(wrapper, token, moduleRef, 'controllers'));
        });
    }
    addLink(wrapper, token, moduleRef, collectionName) {
        const instanceLink = {
            moduleId: moduleRef.id,
            wrapperRef: wrapper,
            collection: moduleRef[collectionName],
            token,
        };
        const existingLinks = this.instanceLinks.get(token);
        if (!existingLinks) {
            this.instanceLinks.set(token, [instanceLink]);
        }
        else {
            existingLinks.push(instanceLink);
        }
    }
    getInstanceNameByToken(token) {
        return isFunction(token) ? token?.name : token;
    }
}
