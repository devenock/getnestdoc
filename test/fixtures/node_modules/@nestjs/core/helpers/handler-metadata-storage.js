import { CONTROLLER_ID_KEY } from '../injector/constants.js';
export const HANDLER_METADATA_SYMBOL = Symbol.for('handler_metadata:cache');
export class HandlerMetadataStorage {
    [HANDLER_METADATA_SYMBOL] = new Map();
    set(controller, methodName, metadata) {
        const metadataKey = this.getMetadataKey(controller, methodName);
        this[HANDLER_METADATA_SYMBOL].set(metadataKey, metadata);
    }
    get(controller, methodName) {
        const metadataKey = this.getMetadataKey(controller, methodName);
        return this[HANDLER_METADATA_SYMBOL].get(metadataKey);
    }
    getMetadataKey(controller, methodName) {
        const ctor = controller.constructor;
        const controllerKey = ctor && (ctor[CONTROLLER_ID_KEY] || ctor.name);
        return controllerKey + methodName;
    }
}
