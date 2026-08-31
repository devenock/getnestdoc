import { DECORATORS } from '../constants.js';
export const exploreApiIncludeEndpointMetadata = (instance, prototype, method) => Reflect.getMetadata(DECORATORS.API_INCLUDE_ENDPOINT, method);
