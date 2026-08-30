import { HttpAdapterHost } from '../helpers/http-adapter-host.js';
export class InternalProvidersStorage {
    _httpAdapterHost = new HttpAdapterHost();
    _httpAdapter;
    get httpAdapterHost() {
        return this._httpAdapterHost;
    }
    get httpAdapter() {
        return this._httpAdapter;
    }
    set httpAdapter(httpAdapter) {
        this._httpAdapter = httpAdapter;
    }
}
