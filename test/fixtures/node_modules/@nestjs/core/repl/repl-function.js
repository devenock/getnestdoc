import { clc } from '@nestjs/common/internal';
export class ReplFunction {
    ctx;
    logger;
    constructor(ctx) {
        this.ctx = ctx;
        this.logger = ctx.logger;
    }
    /**
     * @returns A message displayed by calling `<fnName>.help`
     */
    makeHelpMessage() {
        const { description, name, signature } = this.fnDefinition;
        const fnSignatureWithName = `${name}${signature}`;
        return `${clc.yellow(description)}\n${clc.magentaBright('Interface:')} ${clc.bold(fnSignatureWithName)}\n`;
    }
}
