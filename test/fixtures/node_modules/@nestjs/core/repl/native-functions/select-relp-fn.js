import { ReplFunction } from '../repl-function.js';
export class SelectReplFn extends ReplFunction {
    fnDefinition = {
        name: 'select',
        description: 'Allows navigating through the modules tree, for example, to pull out a specific instance from the selected module.',
        signature: '(token: DynamicModule | ClassRef) => INestApplicationContext',
    };
    action(token) {
        return this.ctx.app.select(token);
    }
}
