import { ApiResponseOptions } from '../decorators/index.js';
type GlobalResponesMap = Record<string, Omit<ApiResponseOptions, 'status'>>;
export declare class GlobalResponsesStorageHost {
    private responses;
    add(responses: GlobalResponesMap): void;
    getAll(): GlobalResponesMap;
    clear(): void;
}
export declare const GlobalResponsesStorage: GlobalResponsesStorageHost;
export {};
