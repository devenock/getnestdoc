import { isString } from '@nestjs/common/utils/shared.utils.js';
import { pluginDebugLogger } from './plugin-debug-logger.js';
const defaultOptions = {
    dtoFileNameSuffix: ['.dto.ts', '.entity.ts'],
    controllerFileNameSuffix: ['.controller.ts'],
    classValidatorShim: true,
    classTransformerShim: false,
    dtoKeyOfComment: 'description',
    controllerKeyOfComment: 'summary',
    introspectComments: false,
    esmCompatible: false,
    readonly: false,
    debug: false,
    skipDefaultValues: false
};
export const mergePluginOptions = (options = {}) => {
    const esmCompatibleWasConfigured = Object.prototype.hasOwnProperty.call(options, 'esmCompatible');
    if (isString(options.dtoFileNameSuffix)) {
        options.dtoFileNameSuffix = [options.dtoFileNameSuffix];
    }
    if (isString(options.controllerFileNameSuffix)) {
        options.controllerFileNameSuffix = [options.controllerFileNameSuffix];
    }
    for (const key of ['dtoFileNameSuffix', 'controllerFileNameSuffix']) {
        if (options[key] && options[key].includes('.ts')) {
            pluginDebugLogger.warn(`Skipping ${key} option ".ts" because it can cause unwanted behaviour.`);
            options[key] = options[key].filter((pattern) => pattern !== '.ts');
            if (options[key].length == 0) {
                delete options[key];
            }
        }
    }
    return {
        ...defaultOptions,
        ...options,
        esmCompatibleWasConfigured
    };
};
