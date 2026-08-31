import { DECORATORS } from '../constants.js';
export const exploreApiExcludeEndpointMetadata = (instance, prototype, method) => Reflect.getMetadata(DECORATORS.API_EXCLUDE_ENDPOINT, method);
