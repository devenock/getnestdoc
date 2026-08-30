type InstanceDecorator = (target: unknown) => unknown;
/**
 * Wraps an `instrument.instanceDecorator` so that a decorator throwing on a
 * given instance (e.g. when inspecting a Proxy whose traps throw outside of
 * their intended context, such as `nestjs-cls` proxy providers) does not
 * crash the application bootstrap. The original, undecorated instance is
 * used instead and a warning is logged.
 */
export declare function makeSafeInstanceDecorator(decorator: InstanceDecorator): InstanceDecorator;
export {};
