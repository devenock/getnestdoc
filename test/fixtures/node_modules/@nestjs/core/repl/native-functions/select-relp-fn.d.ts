import type { DynamicModule, INestApplicationContext, Type } from '@nestjs/common';
import { ReplFunction } from '../repl-function.js';
import type { ReplFnDefinition } from '../repl.interfaces.js';
export declare class SelectReplFn extends ReplFunction {
    fnDefinition: ReplFnDefinition;
    action(token: DynamicModule | Type<unknown>): INestApplicationContext;
}
