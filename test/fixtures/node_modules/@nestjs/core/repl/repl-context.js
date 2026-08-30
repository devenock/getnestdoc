import { Logger, } from '@nestjs/common';
import { ApplicationConfig } from '../application-config.js';
import { ModuleRef } from '../injector/index.js';
import { InternalCoreModule } from '../injector/internal-core-module/internal-core-module.js';
import { DebugReplFn, GetReplFn, HelpReplFn, MethodsReplFn, ResolveReplFn, SelectReplFn, } from './native-functions/index.js';
export class ReplContext {
    app;
    logger = new Logger(ReplContext.name);
    debugRegistry = {};
    globalScope = Object.create(null);
    nativeFunctions = new Map();
    container;
    constructor(app, nativeFunctionsClassRefs) {
        this.app = app;
        this.container = app.container; // Using `any` because `app.container` is not public.
        this.initializeContext();
        this.initializeNativeFunctions(nativeFunctionsClassRefs || []);
    }
    writeToStdout(text) {
        process.stdout.write(text);
    }
    initializeContext() {
        const modules = this.container.getModules();
        modules.forEach(moduleRef => {
            let moduleName = moduleRef.metatype.name;
            if (moduleName === InternalCoreModule.name) {
                return;
            }
            if (this.globalScope[moduleName]) {
                moduleName += ` (${moduleRef.token})`;
            }
            this.introspectCollection(moduleRef, moduleName, 'providers');
            this.introspectCollection(moduleRef, moduleName, 'controllers');
            // For in REPL auto-complete functionality
            Object.defineProperty(this.globalScope, moduleName, {
                value: moduleRef.metatype,
                configurable: false,
                enumerable: true,
            });
        });
    }
    introspectCollection(moduleRef, moduleKey, collection) {
        const moduleDebugEntry = {};
        moduleRef[collection].forEach(({ token }) => {
            const stringifiedToken = this.stringifyToken(token);
            if (stringifiedToken === ApplicationConfig.name ||
                stringifiedToken === moduleRef.metatype.name) {
                return;
            }
            if (!this.globalScope[stringifiedToken]) {
                // For in REPL auto-complete functionality
                Object.defineProperty(this.globalScope, stringifiedToken, {
                    value: token,
                    configurable: false,
                    enumerable: true,
                });
            }
            if (stringifiedToken === ModuleRef.name) {
                return;
            }
            moduleDebugEntry[stringifiedToken] = token;
        });
        this.debugRegistry[moduleKey] = {
            ...this.debugRegistry?.[moduleKey],
            [collection]: moduleDebugEntry,
        };
    }
    stringifyToken(token) {
        return typeof token !== 'string'
            ? typeof token === 'function'
                ? token.name
                : token?.toString()
            : `"${token}"`;
    }
    addNativeFunction(NativeFunctionRef) {
        const nativeFunction = new NativeFunctionRef(this);
        const nativeFunctions = [nativeFunction];
        this.nativeFunctions.set(nativeFunction.fnDefinition.name, nativeFunction);
        nativeFunction.fnDefinition.aliases?.forEach(aliasName => {
            const aliasNativeFunction = Object.create(nativeFunction);
            aliasNativeFunction.fnDefinition = {
                name: aliasName,
                description: aliasNativeFunction.fnDefinition.description,
                signature: aliasNativeFunction.fnDefinition.signature,
            };
            this.nativeFunctions.set(aliasName, aliasNativeFunction);
            nativeFunctions.push(aliasNativeFunction);
        });
        return nativeFunctions;
    }
    registerFunctionIntoGlobalScope(nativeFunction) {
        // Bind the method to REPL's context:
        this.globalScope[nativeFunction.fnDefinition.name] =
            nativeFunction.action.bind(nativeFunction);
        // Load the help trigger as a `help` getter on each native function:
        const functionBoundRef = this.globalScope[nativeFunction.fnDefinition.name];
        Object.defineProperty(functionBoundRef, 'help', {
            enumerable: false,
            configurable: false,
            get: () => 
            // Dynamically builds the help message as will unlikely to be called
            // several times.
            this.writeToStdout(nativeFunction.makeHelpMessage()),
        });
    }
    initializeNativeFunctions(nativeFunctionsClassRefs) {
        const builtInFunctionsClassRefs = [
            HelpReplFn,
            GetReplFn,
            ResolveReplFn,
            SelectReplFn,
            DebugReplFn,
            MethodsReplFn,
        ];
        builtInFunctionsClassRefs
            .concat(nativeFunctionsClassRefs)
            .forEach(NativeFunction => {
            const nativeFunctions = this.addNativeFunction(NativeFunction);
            nativeFunctions.forEach(nativeFunction => {
                this.registerFunctionIntoGlobalScope(nativeFunction);
            });
        });
    }
}
