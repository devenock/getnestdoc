import { Readable } from 'stream';
import { types } from 'util';
import { HttpStatus } from '../enums/index.js';
import { Logger } from '../services/index.js';
import { isFunction } from '../utils/shared.utils.js';
/**
 * @see [Streaming files](https://docs.nestjs.com/techniques/streaming-files)
 *
 * @publicApi
 */
export class StreamableFile {
    options;
    stream;
    logger = new Logger('StreamableFile');
    handleError = (err, res) => {
        if (res.destroyed) {
            return;
        }
        if (res.headersSent) {
            res.end();
            return;
        }
        res.statusCode = HttpStatus.BAD_REQUEST;
        res.send(err.message);
    };
    logError = (err) => {
        this.logger.error(err);
    };
    constructor(bufferOrReadStream, options = {}) {
        this.options = options;
        if (types.isUint8Array(bufferOrReadStream)) {
            this.stream = new Readable();
            this.stream.push(bufferOrReadStream);
            this.stream.push(null);
            this.options.length ??= bufferOrReadStream.length;
        }
        else if (bufferOrReadStream.pipe && isFunction(bufferOrReadStream.pipe)) {
            this.stream = bufferOrReadStream;
        }
    }
    getStream() {
        return this.stream;
    }
    getHeaders() {
        const { type = 'application/octet-stream', disposition = undefined, length = undefined, } = this.options;
        return {
            type,
            disposition,
            length,
        };
    }
    get errorHandler() {
        return this.handleError;
    }
    setErrorHandler(handler) {
        this.handleError = handler;
        return this;
    }
    get errorLogger() {
        return this.logError;
    }
    setErrorLogger(handler) {
        this.logError = handler;
        return this;
    }
}
