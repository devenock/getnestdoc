import { __decorate, __metadata } from "tslib";
import { HttpException, HttpStatus, Inject, IntrinsicException, Logger, Optional, } from '@nestjs/common';
import { MESSAGES } from '../constants.js';
import { HttpAdapterHost } from '../helpers/http-adapter-host.js';
import { isObject } from '@nestjs/common/internal';
export class BaseExceptionFilter {
    applicationRef;
    static logger = new Logger('ExceptionsHandler');
    httpAdapterHost;
    constructor(applicationRef) {
        this.applicationRef = applicationRef;
    }
    catch(exception, host) {
        const applicationRef = this.applicationRef ||
            (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);
        if (!(exception instanceof HttpException)) {
            return this.handleUnknownError(exception, host, applicationRef);
        }
        const res = exception.getResponse();
        const message = isObject(res)
            ? res
            : {
                statusCode: exception.getStatus(),
                message: res,
            };
        const response = host.getArgByIndex(1);
        if (!applicationRef.isHeadersSent(response)) {
            applicationRef.reply(response, message, exception.getStatus());
        }
        else {
            applicationRef.end(response);
        }
    }
    handleUnknownError(exception, host, applicationRef) {
        const body = this.isHttpError(exception)
            ? {
                statusCode: exception.statusCode,
                message: exception.message,
            }
            : {
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                message: MESSAGES.UNKNOWN_EXCEPTION_MESSAGE,
            };
        const response = host.getArgByIndex(1);
        if (!applicationRef.isHeadersSent(response)) {
            applicationRef.reply(response, body, body.statusCode);
        }
        else {
            applicationRef.end(response);
        }
        if (!(exception instanceof IntrinsicException)) {
            BaseExceptionFilter.logger.error(exception);
        }
    }
    isExceptionObject(err) {
        return isObject(err) && !!err.message;
    }
    /**
     * Checks if the thrown error is a FastifyError or comes from the "http-errors" library.
     * @param err error object
     */
    isHttpError(err) {
        if (!err || typeof err !== 'object') {
            return false;
        }
        if (err.constructor?.name === 'FastifyError' &&
            typeof err.code === 'string' &&
            typeof err.statusCode === 'number') {
            return true;
        }
        // "http-errors" error signature
        if (typeof err.expose === 'boolean' &&
            typeof err.statusCode === 'number' &&
            err.status === err.statusCode &&
            err instanceof Error) {
            return true;
        }
        // Plain "http error"-shaped values (e.g. objects thrown by third-party
        // middleware) that carry a status code and a message
        return !!(err.statusCode && err.message);
    }
}
__decorate([
    Optional(),
    Inject(),
    __metadata("design:type", HttpAdapterHost)
], BaseExceptionFilter.prototype, "httpAdapterHost", void 0);
