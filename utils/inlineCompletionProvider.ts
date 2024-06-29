import * as vscode from "vscode";
import { verseCompletion } from "./verseCompletion";
import { backgroundProcessor } from './backgroundProcessor';

let shouldProvideCompletion = false;
let isAutocompletingInProgress = false;
let autocompleteCancellationTokenSource: vscode.CancellationTokenSource | undefined;

let cachedConfig: CompletionConfig;

export interface CompletionConfig {
    endpoint: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    completionMode: string;
    similarPairsCount: number;
    surroundingVerseCount: number;
    sourceTextFile: string;
    additionalResourceDirectory: string;
    enableBackgroundProcessing: boolean;
}

// Initialize the config listener
vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('translators-copilot')) {
        refreshCompletionConfig();
        backgroundProcessor.initialize(); 
    }
});

export async function refreshCompletionConfig(): Promise<void> {
    cachedConfig = await fetchCompletionConfig();

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
        const completionConfig = await getCompletionConfig();

        let text: string;
        switch (completionConfig.completionMode) {
            case "verse":
                text = await verseCompletion(document, position, completionConfig, token);
                break;
            case "chapter":
                // TODO: Implement chapter completion
                throw new Error("Chapter completion not yet implemented");
            case "token":
                // TODO: Implement token completion
                throw new Error("Token completion not yet implemented");
            default:
                throw new Error(`Unsupported completion mode: ${completionConfig.completionMode}`);
        }

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

async function fetchCompletionConfig(): Promise<CompletionConfig> {
    try {
        const config = vscode.workspace.getConfiguration("translators-copilot");
        return {
            endpoint: config.get("llmEndpoint") || "",
            apiKey: config.get("api_key") || "",
            model: config.get("model") || "",
            temperature: config.get("temperature") || 0,
            maxTokens: config.get("max_tokens") || 0,
            completionMode: config.get("completionMode") || "verse",
            similarPairsCount: config.get("similarPairsCount") || 5,
            surroundingVerseCount: config.get("surroundingVerseCount") || 5,
            sourceTextFile: config.get("sourceTextFile") || "",
            additionalResourceDirectory: config.get("additionalResourcesDirectory") || "",
            enableBackgroundProcessing: config.get("enableBackgroundProcessing") || false
        };
    } catch (error) {
        console.error("Error getting completion configuration", error);
        throw new Error("Failed to get completion configuration");
    }
}

export async function getCompletionConfig(forceRefresh = false): Promise<CompletionConfig> {
    if (forceRefresh || !cachedConfig) {
        await refreshCompletionConfig();
    }
    return cachedConfig;
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
        const sharedStateExtension = vscode.extensions.getExtension("project-accelerate.shared-state-store");
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
        const resourceDir = (await getCompletionConfig()).additionalResourceDirectory;
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
    const configuredFile = (await getCompletionConfig()).sourceTextFile;
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