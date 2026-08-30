import { ReplFunction } from '../repl-function.js';
import { clc } from '@nestjs/common/internal';
export class DebugReplFn extends ReplFunction {
    fnDefinition = {
        name: 'debug',
        description: 'Print all registered modules as a list together with their controllers and providers.\nIf the argument is passed in, for example, "debug(MyModule)" then it will only print components of this specific module.',
        signature: '(moduleCls?: ClassRef | string) => void',
    };
    action(moduleCls) {
        this.ctx.writeToStdout('\n');
        if (moduleCls) {
            const token = typeof moduleCls === 'function' ? moduleCls.name : moduleCls;
            const moduleEntry = this.ctx.debugRegistry[token];
            if (!moduleEntry) {
                return this.logger.error(`"${token}" has not been found in the modules registry`);
            }
            this.printCtrlsAndProviders(token, moduleEntry);
        }
        else {
            for (const [moduleKey, entry] of Object.entries(this.ctx.debugRegistry)) {
                this.printCtrlsAndProviders(moduleKey, entry);
            }
        }
        this.ctx.writeToStdout('\n');
    }
    printCtrlsAndProviders(moduleName, moduleDebugEntry) {
        this.ctx.writeToStdout(`${clc.green(moduleName)}:\n`);
        this.printCollection('controllers', moduleDebugEntry['controllers']);
        this.printCollection('providers', moduleDebugEntry['providers']);
    }
    printCollection(title, collectionValue) {
        const collectionEntries = Object.keys(collectionValue);
        if (collectionEntries.length <= 0) {
            return;
        }
        this.ctx.writeToStdout(` ${clc.yellow(`- ${title}`)}:\n`);
        collectionEntries.forEach(provider => this.ctx.writeToStdout(`  ${clc.green('◻')} ${provider}\n`));
    }
}
