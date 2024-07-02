import * as vscode from "vscode";
import { CustomWebviewProvider } from "./utils/customWebviewProvider";
import {
    triggerInlineCompletion,
    provideInlineCompletionItems
} from "./utils/inlineCompletionProvider";

let statusBarItem: vscode.StatusBarItem;

class VerseCompletionCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        vscode.window.onDidChangeTextEditorSelection(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    async provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const config = vscode.workspace.getConfiguration('translators-copilot');
     

        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return [];
        }

        const currentLine = editor.selection.active.line;
        const line = document.lineAt(currentLine);
        const match = line.text.match(/^(\w{3}\s\d+:\d+)/);

        if (match) {
            const range = new vscode.Range(currentLine, 0, currentLine, match[0].length);
            const codeLens = new vscode.CodeLens(range, {
                title: "📝Autocomplete",
                command: "extension.triggerInlineCompletion",
                arguments: []
            });
            codeLenses.push(codeLens);
        }

        return codeLenses;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        vscode.window.showInformationMessage("Translators Copilot is now active!");

        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        context.subscriptions.push(statusBarItem);

        const languages = ["scripture"]; 
        let disposables = languages.map((language) => {
            return vscode.languages.registerInlineCompletionItemProvider(language, {
                provideInlineCompletionItems,
            });
        });
        disposables.forEach((disposable) => context.subscriptions.push(disposable));

        let commandDisposable = vscode.commands.registerCommand(
            "extension.triggerInlineCompletion",
            async () => {
                await triggerInlineCompletion(statusBarItem);
            }
        );

        context.subscriptions.push(commandDisposable);

        // Register the CodeLensProvider
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { language: 'scripture' },
                new VerseCompletionCodeLensProvider()
            )
        );

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "sideView",
                new CustomWebviewProvider(context.extensionUri)
            )
        );
    } catch (error) {
        console.error("Error activating extension", error);
        vscode.window.showErrorMessage("Failed to activate Translators Copilot. Please check the logs for details.");
    }
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}