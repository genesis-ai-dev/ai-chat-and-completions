// logger.ts

import * as vscode from 'vscode';

export class Logger {
    private static outputChannel: vscode.OutputChannel;

    static initialize() {
        this.outputChannel = vscode.window.createOutputChannel("Translator's Copilot");
    }

    static log(message: string) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] INFO: ${message}`);
    }

    static warn(message: string) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] WARNING: ${message}`);
    }

    static error(message: string, error: any) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ERROR: ${message}`);
        if (error instanceof Error) {
            this.outputChannel.appendLine(`Error name: ${error.name}`);
            this.outputChannel.appendLine(`Error message: ${error.message}`);
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        } else {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error)}`);
        }
    }

    static debug(message: string, data?: any) {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] DEBUG: ${message}`);
        if (data) {
            this.outputChannel.appendLine(`Debug data: ${JSON.stringify(data, null, 2)}`);
        }
    }

    static show() {
        this.outputChannel.show();
    }
}