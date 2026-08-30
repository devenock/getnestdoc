import { __decorate, __metadata, __param } from "tslib";
import { Injectable, Optional } from '../../decorators/core/index.js';
import { HttpStatus } from '../../enums/index.js';
import { HttpErrorByCode } from '../../utils/http-error-by-code.util.js';
import { isEmptyArray, isObject, isUndefined, } from '../../utils/shared.utils.js';
/**
 * Defines the built-in ParseFile Pipe. This pipe can be used to validate incoming files
 * with `@UploadedFile()` decorator. You can use either other specific built-in validators
 * or provide one of your own, simply implementing it through FileValidator interface
 * and adding it to ParseFilePipe's constructor.
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
let ParseFilePipe = class ParseFilePipe {
    exceptionFactory;
    validators;
    fileIsRequired;
    constructor(options = {}) {
        const { exceptionFactory, errorHttpStatusCode = HttpStatus.BAD_REQUEST, validators = [], fileIsRequired, } = options;
        this.exceptionFactory =
            exceptionFactory ||
                (error => new HttpErrorByCode[errorHttpStatusCode](error));
        this.validators = validators;
        this.fileIsRequired = fileIsRequired ?? true;
    }
    async transform(value) {
        const areThereAnyFilesIn = this.thereAreNoFilesIn(value);
        if (areThereAnyFilesIn && this.fileIsRequired) {
            throw this.exceptionFactory('File is required');
        }
        if (!areThereAnyFilesIn && this.validators.length) {
            await this.validateFilesOrFile(value);
        }
        return value;
    }
    async validateFilesOrFile(value) {
        if (Array.isArray(value)) {
            await Promise.all(value.map(f => this.validate(f)));
        }
        else {
            await this.validate(value);
        }
    }
    thereAreNoFilesIn(value) {
        const isEmptyObject = isObject(value) && isEmptyArray(Object.keys(value));
        return isUndefined(value) || isEmptyArray(value) || isEmptyObject;
    }
    async validate(file) {
        for (const validator of this.validators) {
            await this.validateOrThrow(file, validator);
        }
        return file;
    }
    async validateOrThrow(file, validator) {
        const isValid = await validator.isValid(file);
        if (!isValid) {
            const errorMessage = validator.buildErrorMessage(file);
            throw this.exceptionFactory(errorMessage);
        }
    }
    /**
     * @returns list of validators used in this pipe.
     */
    getValidators() {
        return this.validators;
    }
};
ParseFilePipe = __decorate([
    Injectable(),
    __param(0, Optional()),
    __metadata("design:paramtypes", [Object])
], ParseFilePipe);
export { ParseFilePipe };
