import { identity } from 'es-toolkit/compat';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
function capitalizeFirstLetter(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function sanitizeTypeNameSegment(value) {
    return String(value).replace(/[^A-Za-z0-9_$]/g, '_');
}
export function setMappedTypeClassName(target, prefix, classRef, keys = []) {
    const parentTypeName = classRef.name || 'Anonymous';
    const mappedProperties = keys
        .map((key) => capitalizeFirstLetter(sanitizeTypeNameSegment(key)))
        .join('');
    Object.defineProperty(target, 'name', {
        value: `${prefix}${parentTypeName}${mappedProperties}`
    });
}
export function clonePluginMetadataFactory(target, parent, transformFn = identity) {
    let targetMetadata = {};
    do {
        if (!parent.constructor) {
            return;
        }
        if (!parent.constructor[METADATA_FACTORY_NAME]) {
            continue;
        }
        const parentMetadata = parent.constructor[METADATA_FACTORY_NAME]();
        targetMetadata = {
            ...parentMetadata,
            ...targetMetadata
        };
    } while ((parent = Reflect.getPrototypeOf(parent)) &&
        parent !== Object.prototype &&
        parent);
    targetMetadata = transformFn(targetMetadata);
    if (target[METADATA_FACTORY_NAME]) {
        const originalFactory = target[METADATA_FACTORY_NAME];
        target[METADATA_FACTORY_NAME] = () => {
            const originalMetadata = originalFactory();
            return {
                ...originalMetadata,
                ...targetMetadata
            };
        };
    }
    else {
        target[METADATA_FACTORY_NAME] = () => targetMetadata;
    }
}
