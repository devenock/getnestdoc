import { inheritPropertyInitializers, inheritTransformationMetadata, inheritValidationMetadata } from '@nestjs/mapped-types';
import { omit } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { ApiProperty } from '../decorators/index.js';
import { MetadataLoader } from '../plugin/metadata-loader.js';
import { METADATA_FACTORY_NAME } from '../plugin/plugin-constants.js';
import { ModelPropertiesAccessor } from '../services/model-properties-accessor.js';
import { clonePluginMetadataFactory, setMappedTypeClassName } from './mapped-types.utils.js';
const modelPropertiesAccessor = new ModelPropertiesAccessor();
export function OmitType(classRef, keys) {
    const fields = modelPropertiesAccessor
        .getModelProperties(classRef.prototype)
        .filter((item) => !keys.includes(item));
    const isInheritedPredicate = (propertyKey) => !keys.includes(propertyKey);
    class OmitTypeClass {
        constructor() {
            inheritPropertyInitializers(this, classRef, isInheritedPredicate);
        }
    }
    setMappedTypeClassName(OmitTypeClass, 'Omit', classRef, keys);
    inheritValidationMetadata(classRef, OmitTypeClass, isInheritedPredicate);
    inheritTransformationMetadata(classRef, OmitTypeClass, isInheritedPredicate);
    function applyFields(fields) {
        clonePluginMetadataFactory(OmitTypeClass, classRef.prototype, (metadata) => omit(metadata, keys));
        fields.forEach((propertyKey) => {
            const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, classRef.prototype, propertyKey);
            const decoratorFactory = ApiProperty(metadata);
            decoratorFactory(OmitTypeClass.prototype, propertyKey);
        });
        if (OmitTypeClass[METADATA_FACTORY_NAME]) {
            const pluginMetadata = OmitTypeClass[METADATA_FACTORY_NAME]();
            Object.keys(pluginMetadata).forEach((key) => {
                if (!fields.includes(key)) {
                    const decoratorFactory = ApiProperty(pluginMetadata[key]);
                    decoratorFactory(OmitTypeClass.prototype, key);
                }
            });
        }
    }
    applyFields(fields);
    MetadataLoader.addRefreshHook(() => {
        const fields = modelPropertiesAccessor
            .getModelProperties(classRef.prototype)
            .filter((item) => !keys.includes(item));
        applyFields(fields);
    });
    return OmitTypeClass;
}
