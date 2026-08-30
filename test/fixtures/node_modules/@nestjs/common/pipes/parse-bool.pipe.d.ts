import { ArgumentMetadata, PipeTransform } from '../interfaces/features/pipe-transform.interface.js';
import { ErrorHttpStatusCode } from '../utils/http-error-by-code.util.js';
/**
 * @publicApi
 */
export interface ParseBoolPipeOptions {
    /**
     * The HTTP status code to be used in the response when the validation fails.
     */
    errorHttpStatusCode?: ErrorHttpStatusCode;
    /**
     * A factory function that returns an exception object to be thrown
     * if validation fails.
     * @param error Error message
     * @returns The exception object
     */
    exceptionFactory?: (error: string) => any;
    /**
     * If true, the pipe will return null or undefined if the value is not provided
     * @default false
     */
    optional?: boolean;
}
/**
 * Defines the built-in ParseBool Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
export declare class ParseBoolPipe implements PipeTransform {
    protected readonly options?: ParseBoolPipeOptions | undefined;
    protected exceptionFactory: (error: string) => any;
    constructor(options?: ParseBoolPipeOptions | undefined);
    /**
     * Method that accesses and performs optional transformation on argument for
     * in-flight requests.
     *
     * @param value currently processed route argument
     * @param metadata contains metadata about the currently processed route argument
     */
    transform(value: unknown, metadata: ArgumentMetadata): Promise<boolean | undefined | null>;
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is said 'true', ie., if it is equal to the boolean
     * `true` or the string `"true"`
     */
    protected isTrue(value: unknown): boolean;
    /**
     * @param value currently processed route argument
     * @returns `true` if `value` is said 'false', ie., if it is equal to the boolean
     * `false` or the string `"false"`
     */
    protected isFalse(value: unknown): boolean;
}
