import { RuntimeException } from './runtime.exception.js';
export declare class InvalidClassModuleException extends RuntimeException {
    constructor(metatypeUsedAsAModule: any, scope: any[], classKind: 'provider' | 'controller' | 'filter');
}
