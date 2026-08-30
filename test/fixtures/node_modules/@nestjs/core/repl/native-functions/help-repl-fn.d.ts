import { ReplFunction } from '../repl-function.js';
import type { ReplFnDefinition } from '../repl.interfaces.js';
export declare class HelpReplFn extends ReplFunction {
    fnDefinition: ReplFnDefinition;
    static buildHelpMessage: ({ name, description }: ReplFnDefinition) => string;
    action(): void;
}
