import { inheritPropertyInitializers, inheritTransformationMetadata, inheritValidationMetadata } from '@nestjs/mapped-types';
import { pick } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { ApiProperty } from '../decorators/index.js';
import { MetadataLoader } from '../plugin/metadata-loader.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
import { ModelPropertiesAccessor } from '../services/model-properties-accessor.js';
import { clonePluginMetadataFactory, setMappedTypeClassName } from './mapped-types.utils.js';
const modelPropertiesAccessor = new ModelPropertiesAccessor();
export function PickType(classRef, keys) {
    const fields = modelPropertiesAccessor
        .getModelProperties(classRef.prototype)
        .filter((item) => keys.includes(item));
    const isInheritedPredicate = (propertyKey) => keys.includes(propertyKey);
    class PickTypeClass {
        constructor() {
            inheritPropertyInitializers(this, classRef, isInheritedPredicate);
        }
    }
    setMappedTypeClassName(PickTypeClass, 'Pick', classRef, keys);
    inheritValidationMetadata(classRef, PickTypeClass, isInheritedPredicate);
    inheritTransformationMetadata(classRef, PickTypeClass, isInheritedPredicate);
    function applyFields(fields) {
        clonePluginMetadataFactory(PickTypeClass, classRef.prototype, (metadata) => pick(metadata, keys));
        fields.forEach((propertyKey) => {
            const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, classRef.prototype, propertyKey);
            const decoratorFactory = ApiProperty(metadata);
            decoratorFactory(PickTypeClass.prototype, propertyKey);
        });
        if (PickTypeClass[METADATA_FACTORY_NAME]) {
            const pluginMetadata = PickTypeClass[METADATA_FACTORY_NAME]();
            Object.keys(pluginMetadata).forEach((key) => {
                if (!fields.includes(key)) {
                    const decoratorFactory = ApiProperty(pluginMetadata[key]);
                    decoratorFactory(PickTypeClass.prototype, key);
                }
            });
        }
    }
    applyFields(fields);
    MetadataLoader.addRefreshHook(() => {
        const fields = modelPropertiesAccessor
            .getModelProperties(classRef.prototype)
            .filter((item) => keys.includes(item));
        applyFields(fields);
    });
    return PickTypeClass;
}
