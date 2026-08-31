import { DECORATORS } from '../constants.js';
export const exploreGlobalApiProducesMetadata = (metatype) => {
    const produces = Reflect.getMetadata(DECORATORS.API_PRODUCES, metatype);
    return produces ? { produces } : undefined;
};
export const exploreApiProducesMetadata = (instance, prototype, method) => Reflect.getMetadata(DECORATORS.API_PRODUCES, method);
