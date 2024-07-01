import * as vscode from "vscode";
import { CustomWebviewProvider } from "./utils/customWebviewProvider";
import {
  triggerInlineCompletion,
  provideInlineCompletionItems
} from "./utils/inlineCompletionProvider";

let statusBarItem: vscode.StatusBarItem;

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