import * as ts from 'typescript';
import { mergePluginOptions } from '../merge-options.js';
import { isFilenameMatched } from '../utils/is-filename-matched.util.js';
import { ControllerClassVisitor } from './controller-class.visitor.js';
import { ModelClassVisitor } from './model-class.visitor.js';
function collectProjectReferenceSourceFiles(projectReferences, visitedProjects = new Set()) {
    if (!projectReferences) {
        return [];
    }
    const sourceFiles = [];
    for (const ref of projectReferences) {
        const refConfigPath = ts.resolveProjectReferencePath(ref);
        if (visitedProjects.has(refConfigPath)) {
            continue;
        }
        visitedProjects.add(refConfigPath);
        const parsedRef = ts.getParsedCommandLineOfConfigFile(refConfigPath, undefined, ts.sys);
        if (parsedRef) {
            sourceFiles.push(...parsedRef.fileNames);
            sourceFiles.push(...collectProjectReferenceSourceFiles(parsedRef.projectReferences, visitedProjects));
        }
    }
    return sourceFiles;
}
export class ReadonlyVisitor {
    static createTsProgram(tsconfigPath) {
        let parseError;
        const host = {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic(diagnostic) {
                parseError = diagnostic;
            }
        };
        const parsedCmd = ts.getParsedCommandLineOfConfigFile(tsconfigPath, undefined, host);
        if (!parsedCmd || parseError) {
            const message = parseError
                ? ts.flattenDiagnosticMessageText(parseError.messageText, '\n')
                : tsconfigPath;
            throw new Error(`Failed to parse tsconfig at path: ${message}`);
        }
        const { options, fileNames, projectReferences } = parsedCmd;
        const referencedSourceFiles = collectProjectReferenceSourceFiles(projectReferences);
        const rootNames = [...new Set([...fileNames, ...referencedSourceFiles])];
        return ts.createProgram({ options, rootNames });
    }
    get typeImports() {
        return {
            ...this.modelClassVisitor.typeImports,
            ...this.controllerClassVisitor.typeImports
        };
    }
    constructor(options) {
        this.options = options;
        this.key = '@nestjs/swagger';
        this.modelClassVisitor = new ModelClassVisitor();
        this.controllerClassVisitor = new ControllerClassVisitor();
        options.readonly = true;
        if (!options.pathToSource) {
            throw new Error(`"pathToSource" must be defined in plugin options`);
        }
    }
    visit(program, sf) {
        const factoryHost = { factory: ts.factory };
        const compilerOptions = program.getCompilerOptions();
        if (compilerOptions.outDir) {
            this.options.outDir ??= compilerOptions.outDir;
        }
        if (compilerOptions.rootDir) {
            this.options.rootDir ??= compilerOptions.rootDir;
        }
        const parsedOptions = mergePluginOptions(this.options);
        if (isFilenameMatched(parsedOptions.dtoFileNameSuffix, sf.fileName)) {
            return this.modelClassVisitor.visit(sf, factoryHost, program, parsedOptions);
        }
        if (isFilenameMatched(parsedOptions.controllerFileNameSuffix, sf.fileName)) {
            return this.controllerClassVisitor.visit(sf, factoryHost, program, parsedOptions);
        }
    }
    collect() {
        return {
            models: this.modelClassVisitor.collectedMetadata(),
            controllers: this.controllerClassVisitor.collectedMetadata()
        };
    }
}
