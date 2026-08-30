export class RuntimeException extends Error {
    constructor(message = ``) {
        super(message);
    }
    what() {
        return this.message;
    }
}
