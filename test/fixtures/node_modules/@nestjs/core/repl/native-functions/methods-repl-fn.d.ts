import type { Type } from '@nestjs/common';
import { ReplFunction } from '../repl-function.js';
import type { ReplFnDefinition } from '../repl.interfaces.js';
export declare class MethodsReplFn extends ReplFunction {
    fnDefinition: ReplFnDefinition;
    private readonly metadataScanner;
    action(token: Type<unknown> | string): void;
}
