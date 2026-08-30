import type { ParameterDecoratorOptions } from '../decorators/http/route-params.decorator.js';
/**
 * Determines whether a parameter-decorator argument is a
 * `ParameterDecoratorOptions` object rather than a pipe (instance or class).
 *
 * Kept in one place so every decorator (`@Query`, `@Body`, `@Param`,
 * `@RawBody`, `@Payload`, `@MessageBody`, custom decorators, ...) classifies
 * arguments identically: a pipe instance that happens to expose a `schema` or
 * `pipes` property must never be mistaken for an options object.
 *
 * @internal
 */
export declare function isParameterDecoratorOptions(value: unknown): value is ParameterDecoratorOptions;
