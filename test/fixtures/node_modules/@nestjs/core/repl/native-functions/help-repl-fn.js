import { iterate } from 'iterare';
import { ReplFunction } from '../repl-function.js';
import { clc } from '@nestjs/common/internal';
export class HelpReplFn extends ReplFunction {
    fnDefinition = {
        name: 'help',
        signature: '() => void',
        description: 'Display all available REPL native functions.',
    };
    static buildHelpMessage = ({ name, description }) => clc.cyanBright(name) +
        (description ? ` ${clc.bold('-')} ${description}` : '');
    action() {
        const sortedNativeFunctions = iterate(this.ctx.nativeFunctions)
            .map(([, nativeFunction]) => nativeFunction.fnDefinition)
            .toArray()
            .sort((a, b) => (a.name < b.name ? -1 : 1));
        this.ctx.writeToStdout(`You can call ${clc.bold('.help')} on any function listed below (e.g.: ${clc.bold('help.help')}):\n\n` +
            sortedNativeFunctions.map(HelpReplFn.buildHelpMessage).join('\n') +
            // Without the following LF the last item won't be displayed
            '\n');
    }
}
