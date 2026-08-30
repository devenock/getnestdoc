import { REQUEST_CONTEXT_ID } from '../router/request/request-constants.js';
import { isObject } from '@nestjs/common/internal';
export function createContextId() {
    /**
     * We are generating random identifier to track asynchronous
     * execution context. An identifier does not have to be neither unique
     * nor unpredictable because WeakMap uses objects as keys (reference comparison).
     * Thus, even though identifier number might be equal, WeakMap would properly
     * associate asynchronous context with its internal map values using object reference.
     * Object is automatically removed once request has been processed (closure).
     */
    return { id: Math.random() };
}
export class ContextIdFactory {
    static strategy;
    /**
     * Generates a context identifier based on the request object.
     */
    static create() {
        return createContextId();
    }
    /**
     * Generates a random identifier to track asynchronous execution context.
     * @param request request object
     */
    static getByRequest(request, propsToInspect = ['raw']) {
        if (!request) {
            return ContextIdFactory.create();
        }
        if (request[REQUEST_CONTEXT_ID]) {
            return request[REQUEST_CONTEXT_ID];
        }
        for (const key of propsToInspect) {
            if (request[key]?.[REQUEST_CONTEXT_ID]) {
                return request[key][REQUEST_CONTEXT_ID];
            }
        }
        if (!this.strategy) {
            return ContextIdFactory.create();
        }
        const contextId = createContextId();
        const resolverObjectOrFunction = this.strategy.attach(contextId, request);
        if (this.isContextIdResolverWithPayload(resolverObjectOrFunction)) {
            contextId.getParent = resolverObjectOrFunction.resolve;
            contextId.payload = resolverObjectOrFunction.payload;
        }
        else {
            contextId.getParent = resolverObjectOrFunction;
        }
        return contextId;
    }
    /**
     * Registers a custom context id strategy that lets you attach
     * a parent context id to the existing context id object.
     * @param strategy strategy instance
     */
    static apply(strategy) {
        this.strategy = strategy;
    }
    static isContextIdResolverWithPayload(resolverOrResolverFn) {
        return isObject(resolverOrResolverFn);
    }
}
