import { ReplaySubject } from 'rxjs';
import { uid } from 'uid';
export class ModulesContainer extends Map {
    _applicationId = uid(21);
    _rpcTargetRegistry$ = new ReplaySubject();
    /**
     * Unique identifier of the application instance.
     */
    get applicationId() {
        return this._applicationId;
    }
    /**
     * Retrieves a module by its identifier.
     * @param id The identifier of the module to retrieve.
     * @returns The module instance if found, otherwise undefined.
     */
    getById(id) {
        return Array.from(this.values()).find(moduleRef => moduleRef.id === id);
    }
    /**
     * Returns the RPC target registry as an observable.
     * This registry contains all RPC targets registered in the application.
     * @returns An observable that emits the RPC target registry.
     */
    getRpcTargetRegistry() {
        return this._rpcTargetRegistry$.asObservable();
    }
    /**
     * Adds an RPC target to the registry.
     * @param target The RPC target to add.
     */
    addRpcTarget(target) {
        this._rpcTargetRegistry$.next(target);
    }
}
