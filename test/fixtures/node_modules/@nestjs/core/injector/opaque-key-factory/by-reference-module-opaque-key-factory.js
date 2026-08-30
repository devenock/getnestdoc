import { createHash } from 'crypto';
import { randomStringGenerator } from '@nestjs/common/internal';
const K_MODULE_ID = Symbol('K_MODULE_ID');
export class ByReferenceModuleOpaqueKeyFactory {
    keyGenerationStrategy;
    constructor(options) {
        this.keyGenerationStrategy = options?.keyGenerationStrategy ?? 'random';
    }
    createForStatic(moduleCls, originalRef = moduleCls) {
        return this.getOrCreateModuleId(moduleCls, undefined, originalRef);
    }
    createForDynamic(moduleCls, dynamicMetadata, originalRef) {
        return this.getOrCreateModuleId(moduleCls, dynamicMetadata, originalRef);
    }
    getOrCreateModuleId(moduleCls, dynamicMetadata, originalRef) {
        if (originalRef[K_MODULE_ID]) {
            return originalRef[K_MODULE_ID];
        }
        let moduleId;
        if (this.keyGenerationStrategy === 'random') {
            moduleId = this.generateRandomString();
        }
        else {
            const delimiter = ':';
            moduleId = dynamicMetadata
                ? `${this.generateRandomString()}${delimiter}${this.hashString(moduleCls.name + JSON.stringify(dynamicMetadata))}`
                : `${this.generateRandomString()}${delimiter}${this.hashString(moduleCls.toString())}`;
        }
        originalRef[K_MODULE_ID] = moduleId;
        return moduleId;
    }
    hashString(value) {
        return createHash('sha256').update(value).digest('hex');
    }
    generateRandomString() {
        return randomStringGenerator();
    }
}
