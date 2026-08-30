import { Logger } from '@nestjs/common';
import { ExceptionHandler } from './exception-handler.js';
const DEFAULT_TEARDOWN = () => process.exit(1);
export class ExceptionsZone {
    static exceptionHandler = new ExceptionHandler();
    static run(callback, teardown = DEFAULT_TEARDOWN, autoFlushLogs) {
        try {
            callback();
        }
        catch (e) {
            this.exceptionHandler.handle(e);
            if (autoFlushLogs) {
                Logger.flush();
            }
            teardown(e);
        }
    }
    static async asyncRun(callback, teardown = DEFAULT_TEARDOWN, autoFlushLogs) {
        try {
            await callback();
        }
        catch (e) {
            this.exceptionHandler.handle(e);
            if (autoFlushLogs) {
                Logger.flush();
            }
            teardown(e);
        }
    }
}
