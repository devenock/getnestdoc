import { ExecutionContextHost } from '../helpers/execution-context-host.js';
export class RouterProxy {
    createProxy(targetCallback, exceptionsHandler) {
        return async (req, res, next) => {
            try {
                await targetCallback(req, res, next);
            }
            catch (e) {
                const host = new ExecutionContextHost([req, res, next]);
                exceptionsHandler.next(e, host);
                return res;
            }
        };
    }
    createExceptionLayerProxy(targetCallback, exceptionsHandler) {
        return async (err, req, res, next) => {
            try {
                await targetCallback(err, req, res, next);
            }
            catch (e) {
                const host = new ExecutionContextHost([req, res, next]);
                exceptionsHandler.next(e, host);
                return res;
            }
        };
    }
}
