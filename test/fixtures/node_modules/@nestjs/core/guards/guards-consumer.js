import { lastValueFrom, Observable } from 'rxjs';
import { ExecutionContextHost } from '../helpers/execution-context-host.js';
import { isEmptyArray } from '@nestjs/common/internal';
export class GuardsConsumer {
    async tryActivate(guards, args, instance, callback, type) {
        if (!guards || isEmptyArray(guards)) {
            return true;
        }
        const context = this.createContext(args, instance, callback);
        context.setType(type);
        for (const guard of guards) {
            const result = guard.canActivate(context);
            if (typeof result === 'boolean') {
                if (!result) {
                    return false;
                }
                continue;
            }
            if (await this.pickResult(result)) {
                continue;
            }
            return false;
        }
        return true;
    }
    createContext(args, instance, callback) {
        return new ExecutionContextHost(args, instance.constructor, callback);
    }
    async pickResult(result) {
        if (result instanceof Observable) {
            return lastValueFrom(result);
        }
        return result;
    }
}
