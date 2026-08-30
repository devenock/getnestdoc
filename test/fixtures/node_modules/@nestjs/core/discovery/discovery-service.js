import { __decorate, __metadata } from "tslib";
import { flatten, Injectable, SetMetadata, } from '@nestjs/common';
import { uid } from 'uid';
import { ModulesContainer } from '../injector/modules-container.js';
import { DiscoverableMetaHostCollection } from './discoverable-meta-host-collection.js';
/**
 * @publicApi
 */
let DiscoveryService = class DiscoveryService {
    modulesContainer;
    constructor(modulesContainer) {
        this.modulesContainer = modulesContainer;
    }
    /**
     * Creates a decorator that can be used to decorate classes and methods with metadata.
     * The decorator will also add the class to the collection of discoverable classes (by metadata key).
     * Decorated classes can be discovered using the `getProviders` and `getControllers` methods.
     * @returns A decorator function.
     */
    static createDecorator() {
        const metadataKey = uid(21);
        const decoratorFn = (opts) => (target, key, descriptor) => {
            if (!descriptor) {
                DiscoverableMetaHostCollection.addClassMetaHostLink(target, metadataKey);
            }
            SetMetadata(metadataKey, opts ?? {})(target, key, descriptor);
        };
        decoratorFn.KEY = metadataKey;
        return decoratorFn;
    }
    /**
     * Returns an array of instance wrappers (providers).
     * Depending on the options, the array will contain either all providers or only providers with the specified metadata key.
     * @param options Discovery options.
     * @param modules A list of modules to filter by.
     * @returns An array of instance wrappers (providers).
     */
    getProviders(options = {}, modules = this.getModules(options)) {
        if ('metadataKey' in options) {
            const providers = DiscoverableMetaHostCollection.getProvidersByMetaKey(this.modulesContainer, options.metadataKey);
            return Array.from(providers);
        }
        const providers = modules.map(item => [...item.providers.values()]);
        return flatten(providers);
    }
    /**
     * Returns an array of instance wrappers (controllers).
     * Depending on the options, the array will contain either all controllers or only controllers with the specified metadata key.
     * @param options Discovery options.
     * @param modules A list of modules to filter by.
     * @returns An array of instance wrappers (controllers).
     */
    getControllers(options = {}, modules = this.getModules(options)) {
        if ('metadataKey' in options) {
            const controllers = DiscoverableMetaHostCollection.getControllersByMetaKey(this.modulesContainer, options.metadataKey);
            return Array.from(controllers);
        }
        const controllers = modules.map(item => [...item.controllers.values()]);
        return flatten(controllers);
    }
    /**
     * Retrieves metadata from the specified instance wrapper.
     * @param decorator The decorator to retrieve metadata of.
     * @param instanceWrapper Reference to the instance wrapper.
     * @param methodKey An optional method key to retrieve metadata from.
     * @returns Discovered metadata.
     */
    getMetadataByDecorator(decorator, instanceWrapper, methodKey) {
        if (methodKey) {
            return Reflect.getMetadata(decorator.KEY, instanceWrapper.instance[methodKey]);
        }
        const clsRef = instanceWrapper.instance?.constructor ?? instanceWrapper.metatype;
        return Reflect.getMetadata(decorator.KEY, clsRef);
    }
    /**
     * Returns a list of modules to be used for discovery.
     */
    getModules(options = {}) {
        const includeInOpts = 'include' in options;
        if (!includeInOpts) {
            const moduleRefs = [...this.modulesContainer.values()];
            return moduleRefs;
        }
        const whitelisted = this.includeWhitelisted(options.include);
        return whitelisted;
    }
    includeWhitelisted(include) {
        const moduleRefs = [...this.modulesContainer.values()];
        return moduleRefs.filter(({ metatype }) => include.some(item => item === metatype));
    }
};
DiscoveryService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ModulesContainer])
], DiscoveryService);
export { DiscoveryService };
