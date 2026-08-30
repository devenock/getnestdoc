/**
 * @publicApi
 */
export class NestApplicationContextOptions {
    /**
     * Specifies the logger to use.  Pass `false` to turn off logging.
     */
    logger;
    /**
     * Whether to abort the process on Error. By default, the process is exited.
     * Pass `false` to override the default behavior. If `false` is passed, Nest will not exit
     * the application and instead will rethrow the exception.
     * @default true
     */
    abortOnError;
    /**
     * If enabled, logs will be buffered until the "Logger#flush" method is called.
     * @default false
     */
    bufferLogs;
    /**
     * If enabled, logs will be automatically flushed and buffer detached when
     * application initialization process either completes or fails.
     * @default true
     */
    autoFlushLogs;
    /**
     * Whether to run application in the preview mode.
     * In the preview mode, providers/controllers are not instantiated & resolved.
     *
     * @default false
     */
    preview;
    /**
     * Whether to generate a serialized graph snapshot.
     *
     * @default false
     */
    snapshot;
    /**
     * Determines what algorithm use to generate module ids.
     * When set to `deep-hash`, the module id is generated based on the serialized module definition.
     * When set to `reference`, each module obtains a unique id based on its reference.
     *
     * @default 'reference'
     */
    moduleIdGeneratorAlgorithm;
    /**
     * Instrument the application context.
     * This option allows you to add custom instrumentation to the application context.
     */
    instrument;
    /**
     * If enabled, will force the use of console.log/console.error instead of process.stdout/stderr.write
     * in the default ConsoleLogger. This is useful for test environments like Jest that can buffer console calls.
     * @default false
     */
    forceConsole;
}
