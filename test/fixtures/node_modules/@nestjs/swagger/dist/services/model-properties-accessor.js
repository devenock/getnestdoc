import { isFunction, isString } from '@nestjs/common/utils/shared.utils.js';
import 'reflect-metadata';
import { DECORATORS } from '../constants.js';
import { createApiPropertyDecorator } from '../decorators/api-property.decorator.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
export class ModelPropertiesAccessor {
    getModelProperties(prototype) {
        const properties = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, prototype) ||
            [];
        return properties
            .filter(isString)
            .filter((key) => key.charAt(0) === ':' && !isFunction(prototype[key]))
            .map((key) => key.slice(1));
    }
    applyMetadataFactory(prototype) {
        const classPrototype = prototype;
        do {
            if (!prototype.constructor) {
                return;
            }
            if (!prototype.constructor[METADATA_FACTORY_NAME]) {
                continue;
            }
            const metadata = prototype.constructor[METADATA_FACTORY_NAME]();
            const properties = Object.keys(metadata);
            properties.forEach((key) => {
                createApiPropertyDecorator(metadata[key], false)(classPrototype, key);
            });
        } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
            prototype !== Object.prototype &&
            prototype);
    }
}
