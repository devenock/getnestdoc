import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { isConstructor } from '@nestjs/common/utils/shared.utils.js';
import { isArray, isUndefined, negate, pickBy } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
export function createMethodDecorator(metakey, metadata, { overrideExisting } = { overrideExisting: true }) {
    return (target, key, descriptor) => {
        if (typeof metadata === 'object') {
            const prevValue = Reflect.getMetadata(metakey, descriptor.value);
            if (prevValue && !overrideExisting) {
                return descriptor;
            }
            Reflect.defineMetadata(metakey, { ...prevValue, ...metadata }, descriptor.value);
            return descriptor;
        }
        Reflect.defineMetadata(metakey, metadata, descriptor.value);
        return descriptor;
    };
}
export function createClassDecorator(metakey, metadata = []) {
    return (target) => {
        const prevValue = Reflect.getMetadata(metakey, target) || [];
        Reflect.defineMetadata(metakey, [...prevValue, ...metadata], target);
        return target;
    };
}
export function createPropertyDecorator(metakey, metadata, overrideExisting = true) {
    return (target, propertyKey) => {
        const properties = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, target) || [];
        const key = `:${String(propertyKey)}`;
        if (!properties.includes(key)) {
            Reflect.defineMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, [...properties, `:${String(propertyKey)}`], target);
        }
        const existingMetadata = Reflect.getMetadata(metakey, target, propertyKey);
        if (existingMetadata) {
            const newMetadata = pickBy(metadata, negate(isUndefined));
            const ownExistingMetadata = Reflect.getOwnMetadata(metakey, target, propertyKey);
            if (!ownExistingMetadata && newMetadata.type === undefined) {
                const designType = target?.constructor?.[METADATA_FACTORY_NAME]?.()[propertyKey]?.type ??
                    Reflect.getMetadata('design:type', target, propertyKey);
                if (designType) {
                    newMetadata.type = designType;
                }
            }
            const metadataToSave = overrideExisting
                ? {
                    ...existingMetadata,
                    ...newMetadata
                }
                : {
                    ...newMetadata,
                    ...existingMetadata
                };
            Reflect.defineMetadata(metakey, metadataToSave, target, propertyKey);
        }
        else {
            const type = target?.constructor?.[METADATA_FACTORY_NAME]?.()[propertyKey]?.type ??
                Reflect.getMetadata('design:type', target, propertyKey);
            Reflect.defineMetadata(metakey, {
                type,
                ...pickBy(metadata, negate(isUndefined))
            }, target, propertyKey);
        }
    };
}
export function createMixedDecorator(metakey, metadata) {
    return (target, key, descriptor) => {
        if (descriptor) {
            let metadatas;
            if (Array.isArray(metadata)) {
                const previousMetadata = Reflect.getMetadata(metakey, descriptor.value) || [];
                metadatas = [...previousMetadata, ...metadata];
            }
            else {
                const previousMetadata = Reflect.getMetadata(metakey, descriptor.value) || {};
                metadatas = { ...previousMetadata, ...metadata };
            }
            Reflect.defineMetadata(metakey, metadatas, descriptor.value);
            return descriptor;
        }
        let metadatas;
        if (Array.isArray(metadata)) {
            const previousMetadata = Reflect.getMetadata(metakey, target) || [];
            metadatas = [...previousMetadata, ...metadata];
        }
        else {
            const previousMetadata = Reflect.getMetadata(metakey, target) || {};
            metadatas = Object.assign(Object.assign({}, previousMetadata), metadata);
        }
        Reflect.defineMetadata(metakey, metadatas, target);
        return target;
    };
}
export function createParamDecorator(metadata, initial) {
    return (target, key, descriptor) => {
        const paramOptions = {
            ...initial,
            ...pickBy(metadata, negate(isUndefined))
        };
        if (descriptor) {
            const parameters = Reflect.getMetadata(DECORATORS.API_PARAMETERS, descriptor.value) || [];
            Reflect.defineMetadata(DECORATORS.API_PARAMETERS, [...parameters, paramOptions], descriptor.value);
            return descriptor;
        }
        if (typeof target === 'object') {
            return target;
        }
        const propertyKeys = Object.getOwnPropertyNames(target.prototype);
        for (const propertyKey of propertyKeys) {
            if (isConstructor(propertyKey)) {
                continue;
            }
            const methodDescriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyKey);
            if (!methodDescriptor) {
                continue;
            }
            if (!methodDescriptor.value) {
                continue;
            }
            const isApiMethod = Reflect.hasMetadata(METHOD_METADATA, methodDescriptor.value);
            if (!isApiMethod) {
                continue;
            }
            const parameters = Reflect.getMetadata(DECORATORS.API_PARAMETERS, methodDescriptor.value) || [];
            Reflect.defineMetadata(DECORATORS.API_PARAMETERS, [...parameters, paramOptions], methodDescriptor.value);
        }
    };
}
export function getTypeIsArrayTuple(input, isArrayFlag) {
    if (!input) {
        return [input, isArrayFlag];
    }
    if (isArrayFlag) {
        return [input, isArrayFlag];
    }
    const isInputArray = isArray(input);
    const type = isInputArray ? input[0] : input;
    return [type, isInputArray];
}
