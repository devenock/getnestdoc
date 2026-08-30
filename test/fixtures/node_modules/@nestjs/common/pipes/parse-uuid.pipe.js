var ParseUUIDPipe_1;
import { __decorate, __metadata, __param } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { Optional } from '../decorators/core/optional.decorator.js';
import { HttpStatus } from '../enums/http-status.enum.js';
import { HttpErrorByCode, } from '../utils/http-error-by-code.util.js';
import { isNil, isString } from '../utils/shared.utils.js';
/**
 * Defines the built-in ParseUUID Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseUUIDPipe = class ParseUUIDPipe {
    static { ParseUUIDPipe_1 = this; }
    options;
    static uuidRegExps = {
        3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
        4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
        5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
        7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
        all: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
    };
    version;
    exceptionFactory;
    constructor(options) {
        this.options = options;
        options = options || {};
        const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST, version, } = options;
        this.version = version;
        this.exceptionFactory =
            exceptionFactory ||
                (error => new HttpErrorByCode[errorHttpStatusCode](error));
    }
    async transform(value, metadata) {
        if (isNil(value) && this.options?.optional) {
            return value;
        }
        if (!this.isUUID(value, this.version)) {
            throw this.exceptionFactory(`Validation failed (uuid${this.version ? ` v ${this.version}` : ''} is expected)`);
        }
        return value;
    }
    isUUID(str, version = 'all') {
        if (!isString(str)) {
            throw this.exceptionFactory('The value passed as UUID is not a string');
        }
        const pattern = ParseUUIDPipe_1.uuidRegExps[version];
        return pattern?.test(str);
    }
};
ParseUUIDPipe = ParseUUIDPipe_1 = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseUUIDPipe);
export { ParseUUIDPipe };
