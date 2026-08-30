import { PARAMTYPES_METADATA } from '../../constants.js';
export function flatten(arr) {
    const flat = [].concat(...arr);
    return flat.some(Array.isArray)
        ? flatten(flat)
        : flat;
}
/**
 * Decorator that sets required dependencies (required with a vanilla JavaScript objects)
 *
 * @publicApi
 */
export const Dependencies = (...dependencies) => {
    const flattenDeps = flatten(dependencies);
    return (target) => {
        Reflect.defineMetadata(PARAMTYPES_METADATA, flattenDeps, target);
    };
};
