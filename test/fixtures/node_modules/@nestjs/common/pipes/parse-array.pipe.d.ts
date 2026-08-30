import { Type } from '../interfaces/index.js';
import { ArgumentMetadata, PipeTransform } from '../interfaces/features/pipe-transform.interface.js';
import { ValidationPipe, ValidationPipeOptions } from './validation.pipe.js';
/**
 * @publicApi
 */
export interface ParseArrayPipeOptions extends Omit<ValidationPipeOptions, 'transform' | 'validateCustomDecorators' | 'exceptionFactory'> {
    /**
     * Type for items to be converted into
     */
    items?: Type<unknown>;
    /**
     * Items separator to split string by
     * @default ','
     */
    separator?: string;
    /**
     * If true, the pipe will return null or undefined if the value is not provided
     * @default false
     */
    optional?: boolean;
    /**
     * A factory function that returns an exception object to be thrown
     * if validation fails.
     * @param error Error message or object
     * @returns The exception object
     */
    exceptionFactory?: (error: any) => any;
}
/** @deprecated Use `ParseArrayPipeOptions` instead. */
export type ParseArrayOptions = ParseArrayPipeOptions;
/**
 * Defines the built-in ParseArray Pipe
 *
 * @see [Built-in Pipes](https://docs.nestjs.com/pipes#built-in-pipes)
 *
 * @publicApi
 */
export declare class ParseArrayPipe implements PipeTransform {
    protected readonly options: ParseArrayPipeOptions;
    protected readonly validationPipe: ValidationPipe;
    protected exceptionFactory: (error: string) => any;
    constructor(options?: ParseArrayPipeOptions);
    /**
     * Method that accesses and performs optional transformation on argument for
     * in-flight requests.
     *
     * @param value currently processed route argument
     * @param metadata contains metadata about the currently processed route argument
     */
    transform(value: unknown, metadata: ArgumentMetadata): Promise<any>;
    protected isExpectedTypePrimitive(): boolean;
    protected validatePrimitive(originalValue: any, index?: number): any;
}
