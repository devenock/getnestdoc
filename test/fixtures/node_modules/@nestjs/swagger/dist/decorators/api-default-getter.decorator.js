import { DECORATORS } from '../constants.js';
export function ApiDefaultGetter(type, parameter) {
    return (prototype, key, descriptor) => {
        if (type.prototype) {
            Reflect.defineMetadata(DECORATORS.API_DEFAULT_GETTER, { getter: descriptor.value, parameter, prototype }, type.prototype);
        }
        return descriptor;
    };
}
