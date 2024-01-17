const vscode = require('vscode');
const { provideInlineCompletionItems, triggerInlineCompletion } = require('./utils/inlineCompletionProvider');
const { CustomWebviewProvider } = require('./utils/customWebviewProvider');

function activate(context) {
    vscode.window.showInformationMessage("Translators Copilot is now active!");
    const languages = ['scripture']; // NOTE: add other languages as needed
    let disposables = languages.map(language => {
        return vscode.languages.registerInlineCompletionItemProvider(
            language,
            {
                provideInlineCompletionItems
            }
        );
    });
    disposables.forEach(disposable => context.subscriptions.push(disposable));

    let commandDisposable = vscode.commands.registerCommand('extension.triggerInlineCompletion', triggerInlineCompletion);

    context.subscriptions.push(commandDisposable);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'sideView',
            new CustomWebviewProvider(context.extensionUri)
        )
    );
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
}