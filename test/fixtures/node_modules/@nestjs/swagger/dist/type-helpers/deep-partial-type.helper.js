import { applyIsOptionalDecorator, applyValidateIfDefinedDecorator, inheritPropertyInitializers, inheritTransformationMetadata, inheritValidationMetadata } from '@nestjs/mapped-types';
import { mapValues } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { ApiProperty } from '../decorators/index.js';
import { MetadataLoader } from '../plugin/metadata-loader.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
import { ModelPropertiesAccessor } from '../services/model-properties-accessor.js';
import { clonePluginMetadataFactory } from './mapped-types.utils.js';
const modelPropertiesAccessor = new ModelPropertiesAccessor();
const deepPartialCache = new Map();
function isDtoClass(typeRef) {
    if (!typeRef ||
        typeof typeRef !== 'function' ||
        typeRef === String ||
        typeRef === Number ||
        typeRef === Boolean ||
        typeRef === Object ||
        typeRef === Array ||
        typeRef === Date) {
        return false;
    }
    if (!typeRef.prototype) {
        return false;
    }
    const fields = modelPropertiesAccessor.getModelProperties(typeRef.prototype);
    if (fields.length > 0) {
        return true;
    }
    return (typeof typeRef[METADATA_FACTORY_NAME] === 'function');
}
export function DeepPartialType(classRef, options = {}) {
    if (deepPartialCache.has(classRef)) {
        return deepPartialCache.get(classRef);
    }
    const applyPartialDecoratorFn = options.skipNullProperties === false
        ? applyValidateIfDefinedDecorator
        : applyIsOptionalDecorator;
    const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
    class DeepPartialTypeClass {
        constructor() {
            inheritPropertyInitializers(this, classRef);
        }
    }
    deepPartialCache.set(classRef, DeepPartialTypeClass);
    const keysWithValidationConstraints = inheritValidationMetadata(classRef, DeepPartialTypeClass);
    if (keysWithValidationConstraints) {
        keysWithValidationConstraints
            .filter((key) => !fields.includes(key))
            .forEach((key) => applyPartialDecoratorFn(DeepPartialTypeClass, key));
    }
    inheritTransformationMetadata(classRef, DeepPartialTypeClass);
    function applyFields(fields) {
        clonePluginMetadataFactory(DeepPartialTypeClass, classRef.prototype, (metadata) => mapValues(metadata, (item) => ({ ...item, required: false })));
        function applyDeepPartialProperty(metadata, key) {
            let resolvedType = metadata.type;
            if (typeof resolvedType === 'function' && resolvedType.length === 0) {
                try {
                    resolvedType = resolvedType();
                }
                catch {
                    resolvedType = metadata.type;
                }
            }
            let isArray = metadata.isArray === true;
            if (Array.isArray(resolvedType) && resolvedType.length === 1) {
                resolvedType = resolvedType[0];
                isArray = true;
            }
            const isNestedDto = isDtoClass(resolvedType);
            const nestedType = isNestedDto
                ? DeepPartialType(resolvedType, options)
                : metadata.type;
            const decoratorFactory = ApiProperty({
                ...metadata,
                type: nestedType,
                ...(isNestedDto ? { isArray } : {}),
                required: false
            });
            decoratorFactory(DeepPartialTypeClass.prototype, key);
        }
        fields.forEach((key) => {
            const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, classRef.prototype, key) || {};
            applyDeepPartialProperty(metadata, key);
            applyPartialDecoratorFn(DeepPartialTypeClass, key);
        });
        if (DeepPartialTypeClass[METADATA_FACTORY_NAME]) {
            const pluginMetadata = DeepPartialTypeClass[METADATA_FACTORY_NAME]();
            const pluginFields = Object.keys(pluginMetadata);
            pluginFields.forEach((key) => {
                if (!fields.includes(key)) {
                    applyDeepPartialProperty(pluginMetadata[key], key);
                }
                applyPartialDecoratorFn(DeepPartialTypeClass, key);
            });
        }
    }
    applyFields(fields);
    MetadataLoader.addRefreshHook(() => {
        const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
        applyFields(fields);
    });
    return DeepPartialTypeClass;
}
