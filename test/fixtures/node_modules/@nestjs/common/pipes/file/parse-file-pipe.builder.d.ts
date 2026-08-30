import { FileTypeValidatorOptions } from './file-type.validator.js';
import { FileValidator } from './file-validator.interface.js';
import { MaxFileSizeValidatorOptions } from './max-file-size.validator.js';
import { ParseFileOptions } from './parse-file-options.interface.js';
import { ParseFilePipe } from './parse-file.pipe.js';
/**
 * @publicApi
 */
export declare class ParseFilePipeBuilder {
    private validators;
    addMaxSizeValidator(options: MaxFileSizeValidatorOptions): this;
    addFileTypeValidator(options: FileTypeValidatorOptions): this;
    addValidator(validator: FileValidator): this;
    build(additionalOptions?: Omit<ParseFileOptions, 'validators'>): ParseFilePipe;
}
