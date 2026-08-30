import { MetadataScanner } from '../../metadata-scanner.js';
import { ReplFunction } from '../repl-function.js';
import { clc } from '@nestjs/common/internal';
export class MethodsReplFn extends ReplFunction {
    fnDefinition = {
        name: 'methods',
        description: 'Display all public methods available on a given provider or controller.',
        signature: '(token: ClassRef | string) => void',
    };
    metadataScanner = new MetadataScanner();
    action(token) {
        const proto = typeof token !== 'function'
            ? Object.getPrototypeOf(this.ctx.app.get(token))
            : token?.prototype;
        const methods = this.metadataScanner.getAllMethodNames(proto);
        this.ctx.writeToStdout('\n');
        this.ctx.writeToStdout(`${clc.green('Methods')}:\n`);
        methods.forEach(methodName => this.ctx.writeToStdout(` ${clc.yellow('◻')} ${methodName}\n`));
        this.ctx.writeToStdout('\n');
    }
}
