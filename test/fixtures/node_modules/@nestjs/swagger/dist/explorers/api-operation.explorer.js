import { DECORATORS } from '../constants.js';
import { ApiOperation } from '../decorators/api-operation.decorator.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
export const exploreApiOperationMetadata = (instance, prototype, method) => {
    applyMetadataFactory(prototype, instance);
    return Reflect.getMetadata(DECORATORS.API_OPERATION, method);
};
function applyMetadataFactory(prototype, instance) {
    const classPrototype = prototype;
    do {
        if (!prototype.constructor) {
            return;
        }
        if (!prototype.constructor[METADATA_FACTORY_NAME]) {
            continue;
        }
        const metadata = prototype.constructor[METADATA_FACTORY_NAME]();
        const methodKeys = Object.keys(metadata).filter((key) => typeof instance[key] === 'function');
        methodKeys.forEach((key) => {
            const operationMeta = {};
            const { summary, deprecated, tags, description } = metadata[key];
            applyIfNotNil(operationMeta, 'summary', summary);
            applyIfNotNil(operationMeta, 'deprecated', deprecated);
            applyIfNotNil(operationMeta, 'tags', tags);
            applyIfNotNil(operationMeta, 'description', description);
            if (Object.keys(operationMeta).length === 0) {
                return;
            }
            ApiOperation(operationMeta, { overrideExisting: false })(classPrototype, key, Object.getOwnPropertyDescriptor(classPrototype, key));
        });
    } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
        prototype !== Object.prototype &&
        prototype);
}
function applyIfNotNil(target, key, value) {
    if (value !== undefined && value !== null) {
        target[key] = value;
    }
}
