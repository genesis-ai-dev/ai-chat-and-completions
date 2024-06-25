// errors.ts

export class ConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConfigurationError";
    }
}

export class APIError extends Error {
    constructor(message: string, public statusCode?: number) {
        super(message);
        this.name = "APIError";
    }
}

export class FileSystemError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FileSystemError";
    }
}

export class PythonMessengerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PythonMessengerError";
    }
}

export class CompletionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CompletionError";
    }
}