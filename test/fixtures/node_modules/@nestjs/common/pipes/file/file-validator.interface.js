/**
 * Interface describing FileValidators, which can be added to a ParseFilePipe
 *
 * @see {ParseFilePipe}
 * @publicApi
 */
export class FileValidator {
    validationOptions;
    constructor(validationOptions) {
        this.validationOptions = validationOptions;
    }
}
