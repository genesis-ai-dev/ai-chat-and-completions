import * as vscode from "vscode";
import { verseCompletion } from "./verseCompletion";
import {
EbibleCorpusMetadata,
downloadEBibleText,
ensureVrefList,
getEBCorpusMetadataByLanguageCode,
} from "./ebibleCorpusUtils";
import * as path from "path";

let shouldProvideCompletion = false;
let isAutocompletingInProgress = false;
let autocompleteCancellationTokenSource: vscode.CancellationTokenSource | undefined;
let currentSourceText = "";

export const MAX_TOKENS = 4000;
export const TEMPERATURE = 0.8;
const sharedStateExtension = vscode.extensions.getExtension("project-accelerate.shared-state-store");


export interface CompletionConfig {
    endpoint: string;
    apiKey: string;
    model: string;
    contextSize: string;
    additionalResourceDirectory: string;
    contextOmission: boolean;
    sourceBookWhitelist: string;
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
            contextSize: config.get("contextSize") || "medium",
            additionalResourceDirectory: config.get("additionalResourcesDirectory") || "",
            contextOmission: config.get("experimentalContextOmission") || false,
            sourceBookWhitelist: config.get("sourceBookWhitelist") || ""
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
    let toRet;
    const sourceTextSelectionMode: string = vscode.workspace.getConfiguration("translators-copilot").get("sourceTextSelectionMode") || "auto";
    if (sourceTextSelectionMode === "manual") {
        
        if (currentSourceText == "") {currentSourceText = await manuallySelectSourceTextFile() || "";}
        if (currentSourceText == "") {
            vscode.window.showWarningMessage("Failed to manually select source text.");
            currentSourceText = await automaticalySelectSourceTextFile() || "";
            if (currentSourceText == "") {
                vscode.window.showWarningMessage("Failed to automatically select source text.");
            }
        }

        toRet = currentSourceText;
    } else {
        currentSourceText = await automaticalySelectSourceTextFile() || "";
        if (currentSourceText == "") {
            vscode.window.showWarningMessage("Failed to automatically select source text.");
        }
        
        toRet = currentSourceText;
        currentSourceText = "";
    }
    
    return toRet;
}

export async function triggerManualSourceSelection() {
    currentSourceText = await manuallySelectSourceTextFile() || "";
    if (currentSourceText == "") {
        vscode.window.showWarningMessage("Failed to manually select source text.");
        currentSourceText = await automaticalySelectSourceTextFile() || "";
        if (currentSourceText == "") {
            vscode.window.showWarningMessage("Failed to automatically select source text.");
        }
    }
}

async function manuallySelectSourceTextFile(): Promise<string | null> {
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

    const metadata = await readMetadataJson();
    const sourceLanguageCode = metadata.languages.find((lang: any) => lang.projectStatus === 'source')?.tag || "";
   
    if (!sourceLanguageCode) {
        vscode.window.showErrorMessage("No source language specified in project metadata.");
        return null;
    }

    let ebibleCorpusMetadata: EbibleCorpusMetadata[] = getEBCorpusMetadataByLanguageCode(sourceLanguageCode);
    if (ebibleCorpusMetadata.length === 0) {
        vscode.window.showInformationMessage(`No text bibles found for ${sourceLanguageCode} in the eBible corpus.`);
        ebibleCorpusMetadata = getEBCorpusMetadataByLanguageCode(""); // Get all bibles if no language is specified
    }

    const selectedCorpus = await vscode.window.showQuickPick(
        ebibleCorpusMetadata.map((corpus) => ({ label: corpus.file })),
        {
          placeHolder: `Select a source text bible.`,
        }
    );

    if (!selectedCorpus) {
        return null;
    }

    const selectedCorpusMetadata = ebibleCorpusMetadata.find(
        (corpus) => corpus.file === selectedCorpus.label
    );

    if (!selectedCorpusMetadata) {
        return null;
    }

    
    // Remove any existing file extension and add .bible
    const fileName = selectedCorpusMetadata.file.replace(/\.[^/.]+$/, "");
    const bibleFilePath = vscode.Uri.joinPath(sourceTextBiblesPath, `${fileName}.bible`);


    try {
        await vscode.workspace.fs.stat(bibleFilePath);
        return bibleFilePath.fsPath;
    } catch {
        // Bible file doesn't exist, download it
        const workspaceRoot = workspaceFolders[0].uri.fsPath; // Define workspaceRoot
        try { 
            handleBibleDownload(selectedCorpusMetadata, workspaceRoot);
            return bibleFilePath.fsPath;
        } catch {
            vscode.window.showErrorMessage("Failed to download source text. Please download it through the Project Manager extension and try again.");
            return null;
        }
    }

}

async function automaticalySelectSourceTextFile(): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage("No workspace folder found. Please open a folder and try again.");
        return null;
    }

    const sourceTextBiblesPath = vscode.Uri.joinPath(workspaceFolders[0].uri, ".project", "sourceTextBibles");
    const files = await vscode.workspace.fs.readDirectory(sourceTextBiblesPath);
    const bibleFiles = files
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.bible'))
        .map(([name]) => name);
    
    if (bibleFiles.length > 0) {
        return vscode.Uri.joinPath(sourceTextBiblesPath, bibleFiles[0]).fsPath;
    } else {
        vscode.window.showErrorMessage("No .bible files found in the sourceTextBibles directory.");
        return null;
    }
}

//copied from project manager and modified
async function handleBibleDownload(corpusMetadata: EbibleCorpusMetadata, workspaceRoot: string) {
    const vrefPath = await ensureVrefList(workspaceRoot);
  
    const bibleTextPath = path.join(
      workspaceRoot,
      ".project", "sourceTextBibles",
      corpusMetadata.file
    );
    const bibleTextPathUri = vscode.Uri.file(bibleTextPath);
    const LANG_TYPE = "source";
    await downloadEBibleText(corpusMetadata, workspaceRoot, LANG_TYPE);
    vscode.window.showInformationMessage(
    `Bible text for ${corpusMetadata.lang} downloaded successfully.`
    );
    
  
    // Read the vref.txt file and the newly downloaded bible text file
    const vrefFilePath = vscode.Uri.file(vrefPath);
    const vrefFileData = await vscode.workspace.fs.readFile(vrefFilePath);
    const vrefLines = new TextDecoder("utf-8")
      .decode(vrefFileData)
      .split(/\r?\n/);
  
    const bibleTextData = await vscode.workspace.fs.readFile(
      bibleTextPathUri
    );
    const bibleLines = new TextDecoder("utf-8")
      .decode(bibleTextData)
      .split(/\r?\n/);
  
    // Zip the lines together
    const zippedLines = vrefLines
      .map((vrefLine, index) => `${vrefLine} ${bibleLines[index] || ""}`)
      .filter((line) => line.trim() !== "");
  
    // Write the zipped lines to a new .bible file
    let fileNameWithoutExtension = corpusMetadata.file.includes(".")
      ? corpusMetadata.file.split(".")[0]
      : corpusMetadata.file;
  
    const bibleFilePath = path.join(
      workspaceRoot,
      ".project",
      "sourceTextBibles",
      `${fileNameWithoutExtension}.bible`
    );
    const bibleFileUri = vscode.Uri.file(bibleFilePath);
    await vscode.workspace.fs.writeFile(
      bibleFileUri,
      new TextEncoder().encode(zippedLines.join("\n"))
    );
  
    vscode.window.showInformationMessage(
      `.bible file created successfully at ${bibleFilePath}`
    );
  }