import { FileTypeValidator, } from './file-type.validator.js';
import { MaxFileSizeValidator, } from './max-file-size.validator.js';
import { ParseFilePipe } from './parse-file.pipe.js';
/**
 * @publicApi
 */
export class ParseFilePipeBuilder {
    validators = [];
    addMaxSizeValidator(options) {
        return this.addValidator(new MaxFileSizeValidator(options));
    }
    addFileTypeValidator(options) {
        return this.addValidator(new FileTypeValidator(options));
    }
    addValidator(validator) {
        this.validators.push(validator);
        return this;
    }
    build(additionalOptions) {
        const parseFilePipe = new ParseFilePipe({
            ...additionalOptions,
            validators: this.validators,
        });
        this.validators = [];
        return parseFilePipe;
    }
}
