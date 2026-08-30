import { ExecutionContextHost } from '../helpers/execution-context-host.js';
export class ExternalErrorProxy {
    createProxy(targetCallback, exceptionsHandler, type) {
        return async (...args) => {
            try {
                return await targetCallback(...args);
            }
            catch (e) {
                const host = new ExecutionContextHost(args);
                host.setType(type);
                return exceptionsHandler.next(e, host);
            }
        };
    }
}
