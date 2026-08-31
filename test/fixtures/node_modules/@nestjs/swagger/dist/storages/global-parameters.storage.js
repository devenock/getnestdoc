export class GlobalParametersStorageHost {
    constructor() {
        this.parameters = new Array();
    }
    add(...parameters) {
        this.parameters.push(...parameters);
    }
    getAll() {
        return this.parameters;
    }
    clear() {
        this.parameters = [];
    }
}
const globalRef = global;
export const GlobalParametersStorage = globalRef.SwaggerGlobalParametersStorage ||
    (globalRef.SwaggerGlobalParametersStorage =
        new GlobalParametersStorageHost());
