import type { Type } from '@nestjs/common';
import { ReplFunction } from '../repl-function.js';
import type { ReplFnDefinition } from '../repl.interfaces.js';
export declare class DebugReplFn extends ReplFunction {
    fnDefinition: ReplFnDefinition;
    action(moduleCls?: Type<unknown> | string): void;
    private printCtrlsAndProviders;
    private printCollection;
}
