import { ArgumentMetadata } from '../index.js';
import { PipeTransform } from '../interfaces/features/pipe-transform.interface.js';
import { ErrorHttpStatusCode } from '../utils/http-error-by-code.util.js';
/**
 * @publicApi
 */
export interface ParseEnumPipeOptions {
    /**
     * If true, the pipe will return null or undefined if the value is not provided
     * @default false
     */
    optional?: boolean;
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
}
/**
 * Defines the built-in ParseEnum Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
export declare class ParseEnumPipe<T = any> implements PipeTransform<T> {
    protected readonly enumType: T;
    protected readonly options?: ParseEnumPipeOptions | undefined;
    protected exceptionFactory: (error: string) => any;
    constructor(enumType: T, options?: ParseEnumPipeOptions | undefined);
    /**
     * Method that accesses and performs optional transformation on argument for
     * in-flight requests.
     *
     * @param value currently processed route argument
     * @param metadata contains metadata about the currently processed route argument
     */
    transform(value: unknown, metadata: ArgumentMetadata): Promise<T | undefined | null>;
    protected isEnum(value: unknown): boolean;
}
