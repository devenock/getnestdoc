import { isConstructor, isFunction, isNil, } from '@nestjs/common/internal';
export class MetadataScanner {
    cachedScannedPrototypes = new Map();
    /**
     * @deprecated
     * @see {@link getAllMethodNames}
     * @see getAllMethodNames
     */
    scanFromPrototype(instance, prototype, callback) {
        if (!prototype) {
            return [];
        }
        const visitedNames = new Map();
        const result = [];
        do {
            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (visitedNames.has(property)) {
                    continue;
                }
                visitedNames.set(property, true);
                // reason: https://github.com/nestjs/nest/pull/10821#issuecomment-1411916533
                const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
                if (descriptor.set ||
                    descriptor.get ||
                    isConstructor(property) ||
                    !isFunction(prototype[property])) {
                    continue;
                }
                const value = callback(property);
                if (isNil(value)) {
                    continue;
                }
                result.push(value);
            }
        } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
            prototype !== Object.prototype);
        return result;
    }
    /**
     * @deprecated
     * @see {@link getAllMethodNames}
     * @see getAllMethodNames
     */
    *getAllFilteredMethodNames(prototype) {
        yield* this.getAllMethodNames(prototype);
    }
    getAllMethodNames(prototype) {
        if (!prototype) {
            return [];
        }
        if (this.cachedScannedPrototypes.has(prototype)) {
            return this.cachedScannedPrototypes.get(prototype);
        }
        const visitedNames = new Map();
        const result = [];
        this.cachedScannedPrototypes.set(prototype, result);
        do {
            for (const property of Object.getOwnPropertyNames(prototype)) {
                if (visitedNames.has(property)) {
                    continue;
                }
                visitedNames.set(property, true);
                // reason: https://github.com/nestjs/nest/pull/10821#issuecomment-1411916533
                const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
                if (descriptor.set ||
                    descriptor.get ||
                    isConstructor(property) ||
                    !isFunction(prototype[property])) {
                    continue;
                }
                result.push(property);
            }
        } while ((prototype = Reflect.getPrototypeOf(prototype)) &&
            prototype !== Object.prototype);
        return result;
    }
}
