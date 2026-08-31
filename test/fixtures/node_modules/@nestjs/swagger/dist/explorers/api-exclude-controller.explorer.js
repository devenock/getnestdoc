import { DECORATORS } from '../constants.js';
export const exploreApiExcludeControllerMetadata = (metatype) => Reflect.getMetadata(DECORATORS.API_EXCLUDE_CONTROLLER, metatype)?.[0] ===
    true;
