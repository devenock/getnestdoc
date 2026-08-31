import { ParameterObject } from '../interfaces/open-api-spec.interface.js';
export declare class GlobalParametersStorageHost {
    private parameters;
    add(...parameters: ParameterObject[]): void;
    getAll(): ParameterObject[];
    clear(): void;
}
export declare const GlobalParametersStorage: GlobalParametersStorageHost;
