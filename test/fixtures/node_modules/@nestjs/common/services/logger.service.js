var Logger_1;
import { __decorate, __metadata, __param } from "tslib";
import { Injectable, Optional } from '../decorators/core/index.js';
import { isObject } from '../utils/shared.utils.js';
import { ConsoleLogger } from './console-logger.service.js';
import { isLogLevelEnabled } from './utils/index.js';
export const LOG_LEVELS = [
    'verbose',
    'debug',
    'log',
    'warn',
    'error',
    'fatal',
];
const DEFAULT_LOGGER = new ConsoleLogger();
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    day: '2-digit',
    month: '2-digit',
});
/**
 * @publicApi
 */
let Logger = class Logger {
    static { Logger_1 = this; }
    context;
    options;
    static logBuffer = new Array();
    static staticInstanceRef = DEFAULT_LOGGER;
    static logLevels;
    static isBufferAttached;
    localInstanceRef;
    static WrapBuffer = (target, propertyKey, descriptor) => {
        const originalFn = descriptor.value;
        descriptor.value = function (...args) {
            if (Logger_1.isBufferAttached) {
                Logger_1.logBuffer.push({
                    methodRef: originalFn.bind(this),
                    arguments: args,
                });
                return;
            }
            return originalFn.call(this, ...args);
        };
    };
    constructor(context, options = {}) {
        this.context = context;
        this.options = options;
    }
    get localInstance() {
        if (Logger_1.staticInstanceRef === DEFAULT_LOGGER) {
            return this.registerLocalInstanceRef();
        }
        else if (Logger_1.staticInstanceRef instanceof Logger_1) {
            const prototype = Object.getPrototypeOf(Logger_1.staticInstanceRef);
            if (prototype.constructor === Logger_1) {
                return this.registerLocalInstanceRef();
            }
        }
        return Logger_1.staticInstanceRef;
    }
    error(message, ...optionalParams) {
        optionalParams = this.context
            ? (optionalParams.length ? optionalParams : [undefined]).concat(this.context)
            : optionalParams;
        this.localInstance?.error(message, ...optionalParams);
    }
    log(message, ...optionalParams) {
        optionalParams = this.context
            ? optionalParams.concat(this.context)
            : optionalParams;
        this.localInstance?.log(message, ...optionalParams);
    }
    warn(message, ...optionalParams) {
        optionalParams = this.context
            ? optionalParams.concat(this.context)
            : optionalParams;
        this.localInstance?.warn(message, ...optionalParams);
    }
    debug(message, ...optionalParams) {
        optionalParams = this.context
            ? optionalParams.concat(this.context)
            : optionalParams;
        this.localInstance?.debug?.(message, ...optionalParams);
    }
    verbose(message, ...optionalParams) {
        optionalParams = this.context
            ? optionalParams.concat(this.context)
            : optionalParams;
        this.localInstance?.verbose?.(message, ...optionalParams);
    }
    fatal(message, ...optionalParams) {
        optionalParams = this.context
            ? optionalParams.concat(this.context)
            : optionalParams;
        this.localInstance?.fatal?.(message, ...optionalParams);
    }
    static error(message, ...optionalParams) {
        this.staticInstanceRef?.error(message, ...optionalParams);
    }
    static log(message, ...optionalParams) {
        this.staticInstanceRef?.log(message, ...optionalParams);
    }
    static warn(message, ...optionalParams) {
        this.staticInstanceRef?.warn(message, ...optionalParams);
    }
    static debug(message, ...optionalParams) {
        this.staticInstanceRef?.debug?.(message, ...optionalParams);
    }
    static verbose(message, ...optionalParams) {
        this.staticInstanceRef?.verbose?.(message, ...optionalParams);
    }
    static fatal(message, ...optionalParams) {
        this.staticInstanceRef?.fatal?.(message, ...optionalParams);
    }
    /**
     * Print buffered logs and detach buffer.
     */
    static flush() {
        this.isBufferAttached = false;
        this.logBuffer.forEach(item => item.methodRef(...item.arguments));
        this.logBuffer = [];
    }
    /**
     * Attach buffer.
     * Turns on initialization logs buffering.
     */
    static attachBuffer() {
        this.isBufferAttached = true;
    }
    /**
     * Detach buffer.
     * Turns off initialization logs buffering.
     */
    static detachBuffer() {
        this.isBufferAttached = false;
    }
    static getTimestamp() {
        return dateTimeFormatter.format(Date.now());
    }
    static overrideLogger(logger) {
        if (Array.isArray(logger)) {
            Logger_1.logLevels = logger;
            return this.staticInstanceRef?.setLogLevels?.(logger);
        }
        if (isObject(logger)) {
            if (logger instanceof Logger_1 && logger.constructor !== Logger_1) {
                const errorMessage = `Using the "extends Logger" instruction is not allowed in Nest v9. Please, use "extends ConsoleLogger" instead.`;
                this.staticInstanceRef?.error(errorMessage);
                throw new Error(errorMessage);
            }
            this.staticInstanceRef = logger;
        }
        else {
            this.staticInstanceRef = undefined;
        }
    }
    static isLevelEnabled(level) {
        const logLevels = Logger_1.logLevels;
        return isLogLevelEnabled(level, logLevels);
    }
    registerLocalInstanceRef() {
        if (this.localInstanceRef) {
            return this.localInstanceRef;
        }
        this.localInstanceRef = new ConsoleLogger(this.context, {
            timestamp: this.options?.timestamp,
            logLevels: Logger_1.logLevels,
        });
        return this.localInstanceRef;
    }
};
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "error", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "log", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "warn", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "debug", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "verbose", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger.prototype, "fatal", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "error", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "log", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "warn", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "debug", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "verbose", null);
__decorate([
    Logger.WrapBuffer,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], Logger, "fatal", null);
Logger = Logger_1 = __decorate([
    Injectable(),
    __param(0, Optional()),
    __param(1, Optional()),
    __metadata("design:paramtypes", [String, Object])
], Logger);
export { Logger };
