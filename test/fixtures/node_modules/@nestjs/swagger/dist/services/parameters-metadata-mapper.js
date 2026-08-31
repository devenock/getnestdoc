import { isFunction } from '@nestjs/common/utils/shared.utils.js';
import { flatMap, identity } from 'es-toolkit/compat';
import { DECORATORS } from '../constants.js';
import { isBodyParameter } from '../utils/is-body-parameter.util.js';
export class ParametersMetadataMapper {
    constructor(modelPropertiesAccessor) {
        this.modelPropertiesAccessor = modelPropertiesAccessor;
    }
    transformModelToProperties(parameters) {
        const properties = flatMap(parameters, (param) => {
            if (!param) {
                return undefined;
            }
            if (param.standardSchema) {
                return param;
            }
            if (param.type === Object || !param.type) {
                return undefined;
            }
            if (param.name) {
                return param;
            }
            if (isBodyParameter(param)) {
                const isCtor = param.type && isFunction(param.type);
                const name = isCtor ? param.type.name : param.type;
                return { ...param, name };
            }
            const { prototype } = param.type;
            this.modelPropertiesAccessor.applyMetadataFactory(prototype);
            const modelProperties = this.modelPropertiesAccessor.getModelProperties(prototype);
            return modelProperties.map((key) => this.mergeImplicitWithExplicit(key, prototype, param));
        });
        return properties.filter(identity);
    }
    mergeImplicitWithExplicit(key, prototype, param) {
        const reflectedParam = Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES, prototype, key) ||
            {};
        return {
            ...param,
            ...reflectedParam,
            name: reflectedParam.name || key
        };
    }
}
