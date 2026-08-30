import { IntrinsicException, Logger } from '@nestjs/common';
export class ExternalExceptionFilter {
    static logger = new Logger('ExceptionsHandler');
    catch(exception, host) {
        if (exception instanceof Error &&
            !(exception instanceof IntrinsicException)) {
            ExternalExceptionFilter.logger.error(exception);
        }
        throw exception;
    }
}
