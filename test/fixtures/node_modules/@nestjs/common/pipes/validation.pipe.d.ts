import { ClassTransformOptions } from '../interfaces/external/class-transform-options.interface.js';
import { TransformerPackage } from '../interfaces/external/transformer-package.interface.js';
import { ValidationError } from '../interfaces/external/validation-error.interface.js';
import { ValidatorOptions } from '../interfaces/external/validator-options.interface.js';
import { ValidatorPackage } from '../interfaces/external/validator-package.interface.js';
import { ArgumentMetadata, PipeTransform } from '../interfaces/features/pipe-transform.interface.js';
import { Type } from '../interfaces/type.interface.js';
import { ErrorHttpStatusCode } from '../utils/http-error-by-code.util.js';
/**
 * @publicApi
 */
export type ValidationErrorFormat = 'list' | 'grouped';
/**
 * @publicApi
 */
export interface ValidationPipeOptions extends ValidatorOptions {
    transform?: boolean;
    disableErrorMessages?: boolean;
    transformOptions?: ClassTransformOptions;
    errorHttpStatusCode?: ErrorHttpStatusCode;
    exceptionFactory?: (errors: ValidationError[]) => any;
    validateCustomDecorators?: boolean;
    expectedType?: Type<any>;
    validatorPackage?: ValidatorPackage;
    transformerPackage?: TransformerPackage;
    /**
     * Specifies the format of validation error messages.
     * - 'list': Returns an array of error message strings (default). The response message is `string[]`.
     * - 'grouped': Returns an object with property paths as keys and arrays of unmodified error messages as values.
     *   The response message is `Record<string, string[]>`. Custom messages defined in validation decorators
     *   (e.g., `@IsNotEmpty({ message: 'Name is required' })`) are preserved without parent path prefixes.
     *
     * @remarks
     * When using 'grouped', the `message` property in the error response changes from `string[]` to `Record<string, string[]>`.
     * If you have exception filters or interceptors that assume `message` is always an array, they will need to be updated.
     */
    errorFormat?: ValidationErrorFormat;
}
/**
 * @see [Validation](https://docs.nestjs.com/techniques/validation)
 *
 * @publicApi
 */
export declare class ValidationPipe implements PipeTransform {
    protected isTransformEnabled: boolean;
    protected isDetailedOutputDisabled?: boolean;
    protected validatorOptions: ValidatorOptions;
    protected transformOptions: ClassTransformOptions | undefined;
    protected errorHttpStatusCode: ErrorHttpStatusCode;
    protected expectedType: Type<any> | undefined;
    protected exceptionFactory: (errors: ValidationError[]) => any;
    protected validateCustomDecorators: boolean;
    protected errorFormat: ValidationErrorFormat;
    constructor(options?: ValidationPipeOptions);
    protected loadValidator(validatorPackage?: ValidatorPackage): ValidatorPackage | Promise<ValidatorPackage>;
    protected loadTransformer(transformerPackage?: TransformerPackage): TransformerPackage | Promise<TransformerPackage>;
    transform(value: unknown, metadata: ArgumentMetadata): Promise<any>;
    createExceptionFactory(): (validationErrors?: ValidationError[]) => unknown;
    protected toValidate(metadata: ArgumentMetadata): boolean;
    protected transformPrimitive(value: unknown, metadata: ArgumentMetadata): unknown;
    protected toEmptyIfNil<T = any, R = T>(value: unknown, metatype: Type<unknown> | object): R | object | string;
    protected stripProtoKeys(value: any): void;
    protected isPrimitive(value: unknown): boolean;
    protected validate(object: object, validatorOptions?: ValidatorOptions): Promise<ValidationError[]> | ValidationError[];
    protected flattenValidationErrors(validationErrors: ValidationError[]): string[];
    protected groupValidationErrors(validationErrors: ValidationError[], parentPath?: string): Record<string, string[]>;
    protected mapChildrenToValidationErrors(error: ValidationError, parentPath?: string): ValidationError[];
    protected prependConstraintsWithParentProp(parentPath: string, error: ValidationError): ValidationError;
}
