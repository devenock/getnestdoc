import { createHash } from 'crypto';
import _stringify from 'fast-safe-stringify';
import { Logger } from '@nestjs/common';
import { randomStringGenerator, isFunction, isSymbol, } from '@nestjs/common/internal';
// CJS interop: fast-safe-stringify sets module.exports.default = module.exports
const stringify = (_stringify.default ?? _stringify);
const CLASS_STR = 'class ';
const CLASS_STR_LEN = CLASS_STR.length;
export class DeepHashedModuleOpaqueKeyFactory {
    moduleIdsCache = new WeakMap();
    moduleTokenCache = new Map();
    logger = new Logger(DeepHashedModuleOpaqueKeyFactory.name, {
        timestamp: true,
    });
    createForStatic(moduleCls) {
        const moduleId = this.getModuleId(moduleCls);
        const moduleName = this.getModuleName(moduleCls);
        const key = `${moduleId}_${moduleName}`;
        if (this.moduleTokenCache.has(key)) {
            return this.moduleTokenCache.get(key);
        }
        const hash = this.hashString(key);
        this.moduleTokenCache.set(key, hash);
        return hash;
    }
    createForDynamic(moduleCls, dynamicMetadata) {
        const moduleId = this.getModuleId(moduleCls);
        const moduleName = this.getModuleName(moduleCls);
        const opaqueToken = {
            id: moduleId,
            module: moduleName,
            dynamic: dynamicMetadata,
        };
        const start = performance.now();
        const opaqueTokenString = this.getStringifiedOpaqueToken(opaqueToken);
        const timeSpentInMs = performance.now() - start;
        if (timeSpentInMs > 10) {
            const formattedTimeSpent = timeSpentInMs.toFixed(2);
            this.logger.warn(`The module "${opaqueToken.module}" is taking ${formattedTimeSpent}ms to serialize, this may be caused by larger objects statically assigned to the module. Consider changing the "moduleIdGeneratorAlgorithm" option to "reference" to improve the performance.`);
        }
        return this.hashString(opaqueTokenString);
    }
    getStringifiedOpaqueToken(opaqueToken) {
        // Uses safeStringify instead of JSON.stringify to support circular dynamic modules
        // The replacer function is also required in order to obtain real class names
        // instead of the unified "Function" key
        return opaqueToken ? stringify(opaqueToken, this.replacer) : '';
    }
    getModuleId(metatype) {
        let moduleId = this.moduleIdsCache.get(metatype);
        if (moduleId) {
            return moduleId;
        }
        moduleId = randomStringGenerator();
        this.moduleIdsCache.set(metatype, moduleId);
        return moduleId;
    }
    getModuleName(metatype) {
        return metatype.name;
    }
    hashString(value) {
        return createHash('sha256').update(value).digest('hex');
    }
    replacer(key, value) {
        if (isFunction(value)) {
            const funcAsString = value.toString();
            const isClass = funcAsString.slice(0, CLASS_STR_LEN) === CLASS_STR;
            if (isClass) {
                return value.name;
            }
            return funcAsString;
        }
        if (isSymbol(value)) {
            return value.toString();
        }
        return value;
    }
}
