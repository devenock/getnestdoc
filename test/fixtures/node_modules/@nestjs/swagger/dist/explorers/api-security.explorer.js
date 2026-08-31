import { DECORATORS } from '../constants.js';
export const exploreGlobalApiSecurityMetadata = (metatype) => {
    const security = Reflect.getMetadata(DECORATORS.API_SECURITY, metatype);
    return security ? { security } : undefined;
};
export const exploreApiSecurityMetadata = (instance, prototype, method) => {
    return Reflect.getMetadata(DECORATORS.API_SECURITY, method);
};
