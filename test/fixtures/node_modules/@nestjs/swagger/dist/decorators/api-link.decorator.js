import { DECORATORS } from '../constants.js';
export function ApiLink({ from, fromField = 'id', routeParam }) {
    return (controllerPrototype, key, descriptor) => {
        const { prototype } = from;
        if (prototype) {
            const links = Reflect.getMetadata(DECORATORS.API_LINK, prototype) ?? [];
            links.push({
                method: descriptor.value,
                prototype: controllerPrototype,
                field: fromField,
                parameter: routeParam
            });
            Reflect.defineMetadata(DECORATORS.API_LINK, links, prototype);
        }
        return descriptor;
    };
}
