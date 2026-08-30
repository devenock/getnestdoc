import { validateModuleKeys } from '../../utils/validate-module-keys.util.js';
/**
 * Decorator that marks a class as a [module](https://docs.nestjs.com/modules).
 *
 * Modules are used by Nest to organize the application structure into scopes. Controllers
 * and Providers are scoped by the module they are declared in. Modules and their
 * classes (Controllers and Providers) form a graph that determines how Nest
 * performs [Dependency Injection (DI)](https://docs.nestjs.com/providers#dependency-injection).
 *
 * @param metadata module configuration metadata
 *
 * @see [Modules](https://docs.nestjs.com/modules)
 *
 * @publicApi
 */
export function Module(metadata) {
    const propsKeys = Object.keys(metadata);
    validateModuleKeys(propsKeys);
    return (target) => {
        for (const property in metadata) {
            if (Object.hasOwnProperty.call(metadata, property)) {
                Reflect.defineMetadata(property, metadata[property], target);
            }
        }
    };
}
