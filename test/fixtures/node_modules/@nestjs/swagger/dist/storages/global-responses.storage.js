export class GlobalResponsesStorageHost {
    constructor() {
        this.responses = {};
    }
    add(responses) {
        this.responses = {
            ...this.responses,
            ...responses
        };
    }
    getAll() {
        return this.responses;
    }
    clear() {
        this.responses = {};
    }
}
const globalRef = global;
export const GlobalResponsesStorage = globalRef.SwaggerGlobalResponsesStorage ||
    (globalRef.SwaggerGlobalResponsesStorage = new GlobalResponsesStorageHost());
