import { DECORATORS } from '../constants.js';
export const exploreGlobalApiExtraModelsMetadata = (metatype) => {
    const extraModels = Reflect.getMetadata(DECORATORS.API_EXTRA_MODELS, metatype);
    return extraModels || [];
};
export const exploreApiExtraModelsMetadata = (instance, prototype, method) => Reflect.getMetadata(DECORATORS.API_EXTRA_MODELS, method) || [];
