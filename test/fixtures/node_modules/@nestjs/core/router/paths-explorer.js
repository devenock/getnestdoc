import { METHOD_METADATA, PATH_METADATA, VERSION_METADATA, addLeadingSlash, isString, isUndefined, } from '@nestjs/common/internal';
export class PathsExplorer {
    metadataScanner;
    constructor(metadataScanner) {
        this.metadataScanner = metadataScanner;
    }
    scanForPaths(instance, prototype) {
        const instancePrototype = isUndefined(prototype)
            ? Object.getPrototypeOf(instance)
            : prototype;
        return this.metadataScanner
            .getAllMethodNames(instancePrototype)
            .reduce((acc, method) => {
            const route = this.exploreMethodMetadata(instance, instancePrototype, method);
            if (route) {
                acc.push(route);
            }
            return acc;
        }, []);
    }
    exploreMethodMetadata(instance, prototype, methodName) {
        const instanceCallback = instance[methodName];
        const prototypeCallback = prototype[methodName];
        const routePath = Reflect.getMetadata(PATH_METADATA, prototypeCallback);
        if (isUndefined(routePath)) {
            return null;
        }
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, prototypeCallback);
        const version = Reflect.getMetadata(VERSION_METADATA, prototypeCallback);
        const path = isString(routePath)
            ? [addLeadingSlash(routePath)]
            : routePath.map((p) => addLeadingSlash(p));
        return {
            path,
            requestMethod,
            targetCallback: instanceCallback,
            methodName,
            version,
        };
    }
}
