import { __decorate, __metadata } from "tslib";
import { Injectable } from '../decorators/core/injectable.decorator.js';
import { isNil, isNumber } from '../utils/shared.utils.js';
/**
 * Defines the built-in DefaultValue Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let DefaultValuePipe = class DefaultValuePipe {
    defaultValue;
    constructor(defaultValue) {
        this.defaultValue = defaultValue;
    }
    transform(value, _metadata) {
        if (isNil(value) ||
            (isNumber(value) && isNaN(value))) {
            return this.defaultValue;
        }
        return value;
    }
};
DefaultValuePipe = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Object])
], DefaultValuePipe);
export { DefaultValuePipe };
