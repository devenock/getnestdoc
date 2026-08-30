import { ReplFunction } from '../repl-function.js';
export class GetReplFn extends ReplFunction {
    fnDefinition = {
        name: 'get',
        signature: '(token: InjectionToken) => any',
        description: 'Retrieves an instance of either injectable or controller, otherwise, throws exception.',
        aliases: ['$'],
    };
    action(token) {
        return this.ctx.app.get(token);
    }
}
