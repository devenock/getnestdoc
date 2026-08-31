import { inheritPropertyInitializers, inheritTransformationMetadata, inheritValidationMetadata } from '@nestjs/mapped-types';
import { DECORATORS } from '../constants.js';
import { ApiProperty } from '../decorators/index.js';
import { MetadataLoader } from '../plugin/metadata-loader.js';
import { ModelPropertiesAccessor } from '../services/model-properties-accessor.js';
import { clonePluginMetadataFactory } from './mapped-types.utils.js';
const modelPropertiesAccessor = new ModelPropertiesAccessor();
export function IntersectionType(...classRefs) {
    class IntersectionClassType {
        constructor() {
            classRefs.forEach((classRef) => {
                inheritPropertyInitializers(this, classRef);
            });
        }
    }
    classRefs.forEach((classRef) => {
        const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
        inheritValidationMetadata(classRef, IntersectionClassType);
        inheritTransformationMetadata(classRef, IntersectionClassType);
        function applyFields(fields) {
            clonePluginMetadataFactory(IntersectionClassType, classRef.prototype);
            fields.forEach((propertyKey) => {
                const metadata = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, classRef.prototype, propertyKey);
                const decoratorFactory = ApiProperty(metadata);
                decoratorFactory(IntersectionClassType.prototype, propertyKey);
            });
        }
        applyFields(fields);
        MetadataLoader.addRefreshHook(() => {
            const fields = modelPropertiesAccessor.getModelProperties(classRef.prototype);
            applyFields(fields);
        });
    });
    const intersectedNames = classRefs.reduce((prev, ref) => prev + ref.name, '');
    Object.defineProperty(IntersectionClassType, 'name', {
        value: `Intersection${intersectedNames}`
    });
    return IntersectionClassType;
}
