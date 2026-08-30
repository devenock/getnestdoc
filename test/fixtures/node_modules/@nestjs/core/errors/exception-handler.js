import { Logger } from '@nestjs/common';
export class ExceptionHandler {
    static logger = new Logger(ExceptionHandler.name);
    handle(exception) {
        ExceptionHandler.logger.error(exception);
    }
}
