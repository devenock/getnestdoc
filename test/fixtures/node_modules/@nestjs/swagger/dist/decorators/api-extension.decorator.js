import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { isConstructor } from '@nestjs/common/utils/shared.utils.js';
import { clone } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
function applyExtension(target, key, value) {
    const extensions = Reflect.getMetadata(DECORATORS.API_EXTENSION, target) || {};
    Reflect.defineMetadata(DECORATORS.API_EXTENSION, { [key]: value, ...extensions }, target);
}
export function ApiExtension(extensionKey, extensionProperties) {
    if (!extensionKey.startsWith('x-')) {
        throw new Error('Extension key is not prefixed. Please ensure you prefix it with `x-`.');
    }
    return (target, key, descriptor) => {
        const extensionValue = clone(extensionProperties);
        if (descriptor) {
            applyExtension(descriptor.value, extensionKey, extensionValue);
            return descriptor;
        }
        if (typeof target === 'object') {
            return target;
        }
        const apiMethods = Object.getOwnPropertyNames(target.prototype)
            .filter((propertyKey) => !isConstructor(propertyKey))
            .map((propertyKey) => Object.getOwnPropertyDescriptor(target.prototype, propertyKey)?.value)
            .filter((methodDescriptor) => methodDescriptor !== undefined &&
            Reflect.hasMetadata(METHOD_METADATA, methodDescriptor));
        if (apiMethods.length > 0) {
            apiMethods.forEach((method) => applyExtension(method, extensionKey, extensionValue));
        }
        else {
            applyExtension(target, extensionKey, extensionValue);
        }
        return target;
    };
}
