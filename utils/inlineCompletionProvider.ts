import * as vscode from "vscode";
import { verseCompletion } from "./verseCompletion";

let shouldProvideCompletion = false;
let isAutocompletingInProgress = false;
let autocompleteCancellationTokenSource: vscode.CancellationTokenSource | undefined;

export const MAX_TOKENS = 4000;
export const TEMPERATURE = 0.8;
const sharedStateExtension = vscode.extensions.getExtension("project-accelerate.shared-state-store");


export interface CompletionConfig {
    endpoint: string;
    apiKey: string;
    model: string;
    contextSize: string,
    sourceTextFile: string;
    additionalResourceDirectory: string;
}

export async function triggerInlineCompletion(statusBarItem: vscode.StatusBarItem) {
    if (isAutocompletingInProgress) {
        vscode.window.showInformationMessage("Autocomplete is already in progress.");
        return;
    }

    isAutocompletingInProgress = true;
    autocompleteCancellationTokenSource = new vscode.CancellationTokenSource();

    try {
        statusBarItem.text = "$(sync~spin) Autocompleting...";
        statusBarItem.show();

        const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.contentChanges.length > 0 && isAutocompletingInProgress) {
                cancelAutocompletion("User input detected. Autocompletion cancelled.");
            }
        });

        shouldProvideCompletion = true;
        await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger", autocompleteCancellationTokenSource.token);

        disposable.dispose();
    } catch (error) {
        console.error("Error triggering inline completion", error);
        vscode.window.showErrorMessage("Error triggering inline completion. Check the output panel for details.");
    } finally {
        shouldProvideCompletion = false;
        isAutocompletingInProgress = false;
        statusBarItem.hide();
        if (autocompleteCancellationTokenSource) {
            autocompleteCancellationTokenSource.dispose();
        }
    }
}

export async function provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[] | undefined> {
    try {
        if (!shouldProvideCompletion || token.isCancellationRequested) {
            return undefined;
        }

        // Ensure we have the latest config
        const completionConfig = await fetchCompletionConfig();

        let text: string;
        text = await verseCompletion(document, position, completionConfig, token);

         
        if (token.isCancellationRequested) {
            return undefined;
        }

        let completionItem = new vscode.InlineCompletionItem(
            text,
            new vscode.Range(position, position)
        );
        completionItem.range = new vscode.Range(position, position);

        shouldProvideCompletion = false;

        return [completionItem];
    } catch (error) {
        console.error("Error providing inline completion items", error);
        vscode.window.showErrorMessage("Failed to provide inline completion. Check the output panel for details.");
        return undefined;
    } finally {
        isAutocompletingInProgress = false;
        const statusBarItem = vscode.window.createStatusBarItem();
        if (statusBarItem) {
            statusBarItem.hide();
        }
    }
}

function cancelAutocompletion(message: string) {
    if (autocompleteCancellationTokenSource) {
        autocompleteCancellationTokenSource.cancel();
        autocompleteCancellationTokenSource.dispose();
        autocompleteCancellationTokenSource = undefined;
    }
    isAutocompletingInProgress = false;
    shouldProvideCompletion = false;
    vscode.window.showInformationMessage(message);

    const statusBarItem = vscode.window.createStatusBarItem();
    if (statusBarItem) {
        statusBarItem.hide();
    }
}

export async function fetchCompletionConfig(): Promise<CompletionConfig> {
    try {
        const config = vscode.workspace.getConfiguration("translators-copilot");
        if (sharedStateExtension) {
            const stateStore = sharedStateExtension.exports;
            stateStore.updateStoreState({ key: 'currentUserAPI', value: config.get("api_key") || "" });
        }
    
        return {
            endpoint: config.get("llmEndpoint") || "",
            apiKey: config.get("api_key") || "",
            model: config.get("model") || "",
            sourceTextFile: config.get("sourceTextFile") || "",
            contextSize: config.get("contextSize") || "medium",
            additionalResourceDirectory: config.get("additionalResourcesDirectory") || ""
        };
    } catch (error) {
        console.error("Error getting completion configuration", error);
        throw new Error("Failed to get completion configuration");
    }
}

export async function readMetadataJson(): Promise<any> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open.');
        }
        const metadataPath = vscode.Uri.joinPath(workspaceFolders[0].uri, 'metadata.json');
        const metadataContent = await vscode.workspace.fs.readFile(metadataPath);
        return JSON.parse(metadataContent.toString());
    } catch (error) {
        console.error("Error reading metadata.json", error);
        throw new Error(`Error reading metadata.json: ${error}`);
    }
}

export async function findVerseRef(): Promise<string | undefined> {
    try {
        if (sharedStateExtension) {
            const sharedStateStore = sharedStateExtension.exports;
            const verseRefObject = await sharedStateStore.getStoreState("verseRef");
            return verseRefObject?.verseRef;
        } else {
            console.log("Extension 'project-accelerate.shared-state-store' not found.");
            return undefined;
        }
    } catch (error) {
        console.error("Failed to access shared state store", error);
        throw error;
    }
}

export async function getAdditionalResources(verseRef: string): Promise<string> {
    try {
        const resourceDir = (await fetchCompletionConfig()).additionalResourceDirectory;
        if (!resourceDir) {
            console.log("Additional resources directory not specified");
            return "";
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error("No workspace folders found");
        }

        const fullResourcePath = vscode.Uri.joinPath(workspaceFolders[0].uri, resourceDir);

        let relevantContent = "";
        let files: [string, vscode.FileType][];

        try {
            files = await vscode.workspace.fs.readDirectory(fullResourcePath);
        } catch (error) {
            if (error instanceof vscode.FileSystemError) {
                if (error.code === 'FileNotFound') {
                    throw new Error(`Additional resources directory not found: ${fullResourcePath}`);
                } else if (error.code === 'NoPermissions') {
                    throw new Error(`No permission to access additional resources directory: ${fullResourcePath}`);
                }
            }
            throw error;
        }

        for (const [fileName, fileType] of files) {
            if (fileType === vscode.FileType.File) {
                const fileUri = vscode.Uri.joinPath(fullResourcePath, fileName);
                let fileContent: Uint8Array;
                try {
                    fileContent = await vscode.workspace.fs.readFile(fileUri);
                } catch (error) {
                    console.warn(`Failed to read file ${fileName}: ${error}`);
                    continue;
                }

                const text = new TextDecoder().decode(fileContent);
                
                if (text.includes(verseRef)) {
                    const lines = text.split('\n');
                    const relevantLines = lines.filter(line => line.includes(verseRef));
                    relevantContent += `From ${fileName}:\n${relevantLines.join('\n')}\n\n`;
                }
            }
        }

        if (relevantContent.trim() === "") {
            return "No relevant additional resources found.";
        }

        return relevantContent.trim();
    } catch (error) {
        console.error("Error getting additional resources", error);
        return "Error: Unable to retrieve additional resources.";
    }
}

export async function findSourceText(): Promise<string | null> {
    const configuredFile = (await fetchCompletionConfig()).sourceTextFile;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder found. Please open a folder and try again.");
        return null;
    }

    const sourceTextBiblesPath = vscode.Uri.joinPath(workspaceFolders[0].uri, ".project", "sourceTextBibles");

    try {
        await vscode.workspace.fs.stat(sourceTextBiblesPath);
    } catch (error) {
        vscode.window.showErrorMessage("Source text Bibles directory does not exist. Please check your workspace structure.");
        return null;
    }

    try {
        const files = await vscode.workspace.fs.readDirectory(sourceTextBiblesPath);
        const bibleFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.bible'))
            .map(([name]) => name);

        if (configuredFile) {
            if (bibleFiles.includes(configuredFile)) {
                return vscode.Uri.joinPath(sourceTextBiblesPath, configuredFile).fsPath;
            } else {
                vscode.window.showWarningMessage(`Configured source text file "${configuredFile}" not found. Defaulting to first available Bible file.`);
            }
        }

        if (bibleFiles.length > 0) {
            return vscode.Uri.joinPath(sourceTextBiblesPath, bibleFiles[0]).fsPath;
        } else {
            vscode.window.showErrorMessage("No .bible files found in the sourceTextBibles directory.");
            return null;
        }
    } catch (error) {
        console.error("Error reading sourceTextBibles directory", error);
        vscode.window.showErrorMessage("Failed to read sourceTextBibles directory. Please check your workspace structure.");
        return null;
    }
}