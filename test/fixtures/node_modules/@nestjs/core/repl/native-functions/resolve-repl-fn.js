import { ReplFunction } from '../repl-function.js';
export class ResolveReplFn extends ReplFunction {
    fnDefinition = {
        name: 'resolve',
        description: 'Resolves transient or request-scoped instance of either injectable or controller, otherwise, throws exception.',
        signature: '(token: InjectionToken, contextId: any) => Promise<any>',
    };
    action(token, contextId) {
        return this.ctx.app.resolve(token, contextId);
    }
}
