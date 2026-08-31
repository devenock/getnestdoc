import * as ts from 'typescript';
import { PluginOptions } from '../merge-options.js';
export declare class ReadonlyVisitor {
    private readonly options;
    readonly key = "@nestjs/swagger";
    private readonly modelClassVisitor;
    private readonly controllerClassVisitor;
    static createTsProgram(tsconfigPath: string): ts.Program;
    get typeImports(): {
        [x: string]: string;
    };
    constructor(options: PluginOptions);
    visit(program: ts.Program, sf: ts.SourceFile): ts.Node;
    collect(): {
        models: [ts.CallExpression, {
            [x: string]: ts.ObjectLiteralExpression;
        }][];
        controllers: [ts.CallExpression, Record<string, {
            [x: string]: ts.ObjectLiteralExpression;
        }>][];
    };
}
