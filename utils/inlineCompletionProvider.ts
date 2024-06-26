import * as vscode from "vscode";
import axios from "axios";
import * as fs from 'fs';
import * as path from 'path';
import { PythonMessenger } from "./pyglsMessenger";
import NodeCache from 'node-cache';

interface CompletionConfig {
    endpoint: string;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    completionMode: string;
    similarPairsCount: number;
}

interface VerseData {
    sourceLanguageName: string;
    verseRef: string;
    sourceVerse: string;
    currentVerse: string;
    contextVerses: string;
    similarPairs: string;
    otherResources: string;
    sourceChapter: string;
    currentTranslation: string;
    surroundingContext: string;
}

const pyMessenger = new PythonMessenger();
const maxLength = 4000;
const similarPairsCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
let sourceTextFilePath: string | null = null;
let shouldProvideCompletion = false;
const bookOrder = [
    'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
    '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER',
    'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP',
    'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
    'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
    '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV'
];

let config = vscode.workspace.getConfiguration("translators-copilot");

//triggers
export async function triggerInlineCompletion() {
    try {
        shouldProvideCompletion = true;
        await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    } catch (error) {
        console.error("Error triggering inline completion", error);
        if (error instanceof Error) {
            if (error.name === 'ConfigurationError') {
                vscode.window.showErrorMessage(`Configuration error: ${error.message}. Please check your settings.`);
            } else if (error.name === 'APIError') {
                vscode.window.showErrorMessage(`API error: ${error.message}. Please try again later.`);
            } else {
                vscode.window.showErrorMessage(`An unexpected error occurred: ${error.message}`);
            }
        } else {
            vscode.window.showErrorMessage(`An unexpected error occurred: ${String(error)}`);
        }
    } finally {
        shouldProvideCompletion = false;
    }
}

export async function provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[] | undefined> {
    try {
        // Check if completion should be provided
        if (!shouldProvideCompletion) {
            return undefined;
        }

        // Get the completion configuration
        const completionConfig = await getCompletionConfig();

        await initializeSourceTextFile();
        if (!sourceTextFilePath) {
            vscode.window.showErrorMessage("Source text file not found. Inline completion cannot proceed.");
            return undefined;
        }

        // Determine the text to use for completion based on the model and endpoint
        const text = (completionConfig.model.startsWith("gpt") && (completionConfig.endpoint.startsWith("https://api") || completionConfig.endpoint.startsWith("https://localhost")))
            ? await getCompletionTextGPT(document, position)
            : await getCompletionText(document, position);

        // Create a new inline completion item with the generated text
        let completionItem = new vscode.InlineCompletionItem(
            text,
            new vscode.Range(position, position)
        );
        completionItem.range = new vscode.Range(position, position);

        // Reset the flag to indicate completion should not be provided
        shouldProvideCompletion = false;

        // Return the completion item
        return [completionItem];
    } catch (error) {
        // Log the error and show an error message to the user
        console.error("Error providing inline completion items", error);
        vscode.window.showErrorMessage("Failed to provide inline completion. Check the output panel for details.");
        return undefined;
    }
}

//initialization and config
async function getCompletionConfig(): Promise<CompletionConfig> {
    try {
        return {
            endpoint: config.get("llmEndpoint") || "",
            apiKey: config.get("api_key") || "",
            model: config.get("model") || "",
            temperature: config.get("temperature") || 0,
            maxTokens: config.get("max_tokens") || 0,
            completionMode: config.get("completionMode") || "verse",
            similarPairsCount: config.get("similarPairsCount") || 5,
        };
    } catch (error) {
        console.error("Error getting completion configuration", error);
        throw new Error("Failed to get completion configuration");
    }
}

async function initializeConfig() {
    try {
        config = vscode.workspace.getConfiguration("translators-copilot");
        console.log("Configuration initialized successfully");
    } catch (error) {
        console.error("Error initializing configuration", error);
        throw new Error("Failed to initialize configuration");
    }
}

async function initializeSourceTextFile(): Promise<void> {
    try {
        sourceTextFilePath = await findSourceText();
        if (sourceTextFilePath) {
            console.log(`Source text file initialized: ${sourceTextFilePath}`);
        } else {
            vscode.window.showErrorMessage("No source text Bible file found. Inline completion cannot proceed.");
        }
    } catch (error) {
        console.error("Error initializing source text file", error);
        vscode.window.showErrorMessage("Failed to initialize source text file. Please check your configuration and workspace.");
    }
}

// Function to find the source text file for Bible translations
async function findSourceText(): Promise<string | null> {
    // Get the configuration for the "translators-copilot" extension
    const config = vscode.workspace.getConfiguration("translators-copilot");
    // Retrieve the configured source text file name from the configuration
    const configuredFile = config.get("sourceTextFilePath") as string;
    // Get the list of workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;

    // Check if there are any workspace folders open
    if (!workspaceFolders || workspaceFolders.length === 0) {
        // Show an error message if no workspace folder is found
        vscode.window.showErrorMessage("No workspace folder found. Please open a folder and try again.");
        return null;
    }

    // Construct the path to the sourceTextBibles directory within the first workspace folder
    const sourceTextBiblesPath = path.join(workspaceFolders[0].uri.fsPath, ".project", "sourceTextBibles");
    const sourceTextBiblesUri = vscode.Uri.file(sourceTextBiblesPath);

    try {
        // Read the contents of the sourceTextBibles directory
        const files = await vscode.workspace.fs.readDirectory(sourceTextBiblesUri);
        // Filter the files to include only those with a .bible extension
        const bibleFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.bible'))
            .map(([name]) => name);

        // Check if a specific source text file is configured
        if (configuredFile) {
            // If the configured file is found in the directory, return its path
            if (bibleFiles.includes(configuredFile)) {
                return path.join(sourceTextBiblesPath, configuredFile);
            } else {
                // Show a warning message if the configured file is not found and default to the first available file
                vscode.window.showWarningMessage(`Configured source text file "${configuredFile}" not found. Defaulting to first available Bible file.`);
            }
        }

        // If no specific file is configured or the configured file is not found, return the first available .bible file
        if (bibleFiles.length > 0) {
            console.log(path.join(sourceTextBiblesPath, bibleFiles[0]));
            return path.join(sourceTextBiblesPath, bibleFiles[0]);
        } else {
            // Show an error message if no .bible files are found in the directory
            vscode.window.showErrorMessage("No .bible files found in the sourceTextBibles directory.");
            return null;
        }
    } catch (error) {
        // Log the error and show an error message if reading the directory fails
        console.error("Error reading sourceTextBibles directory", error);
        vscode.window.showErrorMessage("Failed to read sourceTextBibles directory. Please check your workspace structure.");
        return null;
    }
}

//completion text
export async function getCompletionTextGPT(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string> {
    try {
        if (sourceTextFilePath === null) {
            throw new Error('Source text file not initialized.');
        }

        const config = await getCompletionConfig();
        const verseData = await getVerseData(document, position);
    
        switch (config.completionMode) {
            case "verse":
                return await completeVerse(config, verseData);
            case "chapter":
                return await completeChapter(document, position, config, verseData);
            case "token":
                console.log("Completing as much as the token limit permits.");
                return "token completion logic not implemented yet.";
            default:
                console.error("Unknown completion mode", { mode: config.completionMode });
                throw new Error(`Unknown completion mode: ${config.completionMode}`);
        }
    } catch (error) {
        console.error("Error in getCompletionTextGPT", error);
        vscode.window.showErrorMessage(`Error during completion: ${error instanceof Error ? error.message : String(error)}`);
        return ""; // Return an empty string if completion fails
    }
}

async function getCompletionText(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string> {
    try {
        const completionConfig = await getCompletionConfig();
        let language = document.languageId;
        let textBeforeCursor = document.getText(
            new vscode.Range(new vscode.Position(0, 0), position)
        );
        textBeforeCursor = textBeforeCursor.length > maxLength
            ? textBeforeCursor.substr(textBeforeCursor.length - maxLength)
            : textBeforeCursor;

        textBeforeCursor = preprocessDocument(textBeforeCursor);

        let prompt = "";
        let stop = ["\n\n", "\r\r", "\r\n\r", "\n\r\n", "```"];

        let lineContent = document.lineAt(position.line).text;
        let leftOfCursor = lineContent.substr(0, position.character).trim();
        if (leftOfCursor !== "") {
            stop.push("\r\n");
        }

        if (textBeforeCursor) {
            prompt = "```" + language + "\r\n" + textBeforeCursor;
        } else {
            return "";
        }

        let data = {
            prompt: prompt,
            max_tokens: 256,
            temperature: completionConfig.temperature,
            stream: false,
            stop: stop,
            n: 2,
            model: completionConfig.model || undefined,
        };

        const headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + completionConfig.apiKey,
        };

        let config = {
            method: "POST",
            url: completionConfig.endpoint + "/completions",
            headers,
            data: JSON.stringify(data),
        };

        const response = await axios.request(config);
        if (
            response &&
            response.data &&
            response.data.choices &&
            response.data.choices.length > 0
        ) {
            return response.data.choices[0].text.replace(/[\r\n]+$/g, "");
        }
        return "";
    } catch (error) {
        console.error("Error getting completion text", error);
        if (axios.isAxiosError(error)) {
            throw new Error(`API request failed: ${error.message}`);
        }
        throw error;
    }
}

//data to feed LLM
async function getVerseData(document: vscode.TextDocument, position: vscode.Position): Promise<VerseData> {
    let verseData: Partial<VerseData> = {};
    let missingResources: string[] = [];

    try {
        // Read metadata and find the source language name
        const metadata = await readMetadataJson();
        verseData.sourceLanguageName = metadata.languages.find((lang: any) => lang.projectStatus === 'source')?.refName || "Unknown";
        
        // Find the verse reference
        verseData.verseRef = await findVerseRef() || "";
        if (!verseData.verseRef) {
            missingResources.push("verse reference");
        }

        // Check if the source text file is available and find the source verse
        if (!sourceTextFilePath) {
            missingResources.push("source text file");
            verseData.sourceVerse = "Source verse unavailable";
        } else {
            try {
                verseData.sourceVerse = await findSourceVerse(sourceTextFilePath, verseData.verseRef);
            } catch (error) {
                console.warn(`Error finding source verse: ${error}`);
                verseData.sourceVerse = "Source verse unavailable";
                missingResources.push("source verse");
            }
        }
    
        // Preprocess the document text and extract the current verse and context verses
        const textBeforeCursor = preprocessDocument(document.getText(new vscode.Range(new vscode.Position(0, 0), position)));
        verseData.currentVerse = extractCurrentVerse(textBeforeCursor, verseData.verseRef);
        verseData.contextVerses = extractContextVerses(textBeforeCursor, verseData.verseRef);
        
        // Retrieve similar pairs
        try {
            verseData.similarPairs = await getSimilarPairs(verseData.verseRef);
        } catch (error) {
            console.warn(`Error getting similar pairs: ${error}`);
            verseData.similarPairs = "Similar pairs unavailable";
            missingResources.push("similar pairs");
        }

        // Retrieve additional resources
        try {
            verseData.otherResources = await getAdditionalResources(verseData.verseRef);
        } catch (error) {
            console.warn(`Error getting additional resources: ${error}`);
            verseData.otherResources = "Additional resources unavailable";
            missingResources.push("additional resources");
        }

        // Retrieve the source chapter
        try {
            verseData.sourceChapter = await getSourceChapter(verseData.verseRef);
        } catch (error) {
            console.warn(`Error getting source chapter: ${error}`);
            verseData.sourceChapter = "Source chapter unavailable";
            missingResources.push("source chapter");
        }

        // Retrieve the current translation
        verseData.currentTranslation = await getCurrentTranslation(document, verseData.verseRef);
        
        // Retrieve the surrounding context
        try {
            verseData.surroundingContext = await getSurroundingContext(verseData.verseRef);
        } catch (error) {
            console.warn(`Error getting surrounding context: ${error}`);
            verseData.surroundingContext = "Surrounding context unavailable";
            missingResources.push("surrounding context");
        }
    } catch (error) {
        console.error("Error in getVerseData", error);
    }

    // Ensure all fields are populated
    Object.keys(verseData).forEach(key => {
        const keyTyped = key as keyof VerseData;
        if (verseData[keyTyped] === undefined) {
            console.warn(`${key} is undefined in verseData`);
            verseData[keyTyped] = `${key} unavailable` as any;
            missingResources.push(key);
        }
    });

    // Show a warning message if any resources are missing
    if (missingResources.length > 0) {
        vscode.window.showWarningMessage(`Some resources are unavailable: ${missingResources.join(", ")}. Completion may be less accurate.`);
    }

    console.log({ verseData });
    return verseData as VerseData;
}

async function readMetadataJson(): Promise<any> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open.');
        }
        const metadataPath = path.join(workspaceFolders[0].uri.fsPath, 'metadata.json');
        const data = await fs.promises.readFile(metadataPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading metadata.json", error);
        throw new Error(`Error reading metadata.json: ${error}`);
    }
}

async function findVerseRef(): Promise<string | undefined> {
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

async function findSourceVerse(sourceTextFilePath: string, verseRef: string): Promise<string> {
    try {
        if (!sourceTextFilePath) {
            throw new Error('Source file not specified.');
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open.');
        }
        const fileUri = vscode.Uri.file(sourceTextFilePath);
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const fileContents = Buffer.from(fileData).toString('utf-8');
        const verseRegex = new RegExp(`^${verseRef}.*$`, 'm');
        const match = fileContents.match(verseRegex);
        if (match) {
            return match[0];
        } else {
            throw new Error(`Verse ${verseRef} not found in the source language Bible.`);
        }
    } catch (error) {
        console.error("Error reading source language Bible", error);
        throw new Error(`Error reading source language Bible: ${error}`);
    }
}

function preprocessDocument(text: string): string {
    try {
        const lines = text.split("\r\n");
        for (let i = 1; i < lines.length; i++) {
            if (lines[i - 1].trim() !== "" && isStartWithComment(lines[i])) {
                lines[i] = "\r\n" + lines[i];
            }
        }
        return lines.join("\r\n");
    } catch (error) {
        console.error("Error preprocessing document", error);
        throw error;
    }

    function isStartWithComment(line: string): boolean {
        const trimLine = line.trim();
        const commentStartSymbols = ["//", "#", "/*", "<!--", "{/*"];
        return commentStartSymbols.some(symbol => trimLine.startsWith(symbol));
    }
}

function extractCurrentVerse(text: string, verseRef: string): string {
    if (!verseRef) return "";
    const verseRefPosition = text.indexOf(verseRef);
    if (verseRefPosition !== -1) {
        return verseRef + text.substring(verseRefPosition + verseRef.length);
    }
    return "";
}

function extractContextVerses(text: string, verseRef: string): string {
    if (!verseRef) return "";
    let contextVerses = text.substring(0, text.indexOf(verseRef));
    const bookCode = verseRef.substring(0, 3);
    const regexPattern = new RegExp(`(${bookCode} \\d+:\\d+\\s*)+$`, "g");
    return contextVerses.replace(regexPattern, '');
}

async function getSimilarPairs(verseRef: string): Promise<string> {
    try {
        const config = await getCompletionConfig();
        const cacheKey = `${verseRef}-${config.similarPairsCount}`;
        const cachedResult = similarPairsCache.get<string>(cacheKey);
        
        if (cachedResult) {
            return cachedResult;
        }

        const result = await pyMessenger.getSimilarDrafts(verseRef, config.similarPairsCount);
        if (!result || result.trim() === "") {
            throw new Error("Empty result from getSimilarDrafts");
        }
        similarPairsCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error("Error getting similar pairs", error);
        return "Error: Unable to retrieve similar verse pairs.";
    }
}

async function getAdditionalResources(verseRef: string): Promise<string> {
    try {
        const config = vscode.workspace.getConfiguration("translators-copilot");
        const resourceDir = config.get("additionalResourcesDirectory") as string;
        if (!resourceDir) {
            console.log("Additional resources directory not specified");
            return "";
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error("No workspace folders found");
        }

        const fullResourcePath = path.join(workspaceFolders[0].uri.fsPath, resourceDir);
        const dirUri = vscode.Uri.file(fullResourcePath);

        let relevantContent = "";
        let files: [string, vscode.FileType][];

        try {
            files = await vscode.workspace.fs.readDirectory(dirUri);
        } catch (error) {
            if (error instanceof vscode.FileSystemError) {
                if (error.code === 'FileNotFound') {
                    throw new Error(`Additional resources directory not found: ${fullResourcePath}`);
                } else if (error.code === 'NoPermissions') {
                    throw new Error(`No permission to access additional resources directory: ${fullResourcePath}`);
                }
            }
            throw error; // Re-throw if it's an unexpected error
        }

        for (const [fileName, fileType] of files) {
            if (fileType === vscode.FileType.File) {
                const fileUri = vscode.Uri.joinPath(dirUri, fileName);
                let fileContent: Uint8Array;
                try {
                    fileContent = await vscode.workspace.fs.readFile(fileUri);
                } catch (error) {
                    console.warn(`Failed to read file ${fileName}: ${error}`);
                    continue; // Skip this file and continue with the next one
                }

                const text = new TextDecoder().decode(fileContent);
                
                // Simple string matching for now. Consider more sophisticated matching in the future.
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

async function getSourceChapter(verseRef: string): Promise<string> {
    try {
        // Check if the source text file path is initialized
        if (sourceTextFilePath === null) {
            throw new Error('Source text file not initialized.');
        }

        // Split the verse reference into book and chapter:verse parts
        const [book, chapterVerse] = verseRef.split(' ');
        // Extract the chapter number from the chapter:verse part
        const chapter = chapterVerse.split(':')[0];

        // Convert the file path to a Uri
        const fileUri = vscode.Uri.file(sourceTextFilePath);
        // Read the content of the source text file
        const sourceContent = await vscode.workspace.fs.readFile(fileUri);
        // Decode the file content from Uint8Array to string
        const text = new TextDecoder().decode(sourceContent);

        // Find the start index of the specified chapter in the text
        const chapterStart = text.indexOf(`${book} ${chapter}:1`);
        if (chapterStart === -1) {
            throw new Error(`Chapter start not found for ${book} ${chapter}`);
        }

        // Find the start index of the next chapter in the text
        const nextChapterStart = text.indexOf(`${book} ${parseInt(chapter) + 1}:1`);

        // Return the text of the specified chapter, up to the start of the next chapter if found
        return text.substring(chapterStart, nextChapterStart !== -1 ? nextChapterStart : undefined);
    } catch (error) {
        // Log the error and rethrow it with a more specific message if it's a file system error
        console.error(`Error getting source chapter for ${verseRef}`, error);
        if (error instanceof vscode.FileSystemError) {
            throw new Error(`Failed to read source text file: ${error.message}`);
        }
        throw error;
    }
}

async function getCurrentTranslation(document: vscode.TextDocument, verseRef: string): Promise<string> {
    try {
        const [book, chapterVerse] = verseRef.split(' ');
        const chapter = chapterVerse.split(':')[0];
        const text = document.getText();
        const chapterStart = text.indexOf(`${book} ${chapter}:1`);
        if (chapterStart === -1) {
            throw new Error(`Chapter start not found for ${book} ${chapter}`);
        }
        const nextChapterStart = text.indexOf(`${book} ${parseInt(chapter) + 1}:1`);
        return text.substring(chapterStart, nextChapterStart !== -1 ? nextChapterStart : undefined);
    } catch (error) {
        console.error(`Error getting current translation for ${verseRef}`, error);
        throw error;
    }
}

//getSurroundingContext and its helpers
async function getSurroundingContext(verseRef: string): Promise<string> {
    try {
        if (sourceTextFilePath === null) {
            throw new Error('Source text file not initialized.');
        }

        const config = vscode.workspace.getConfiguration("translators-copilot");
        const n = config.get<number>("surroundingVerseCount") || 5;

        const [book, chapterVerse] = verseRef.split(' ');
        const [chapter, verse] = chapterVerse.split(':').map(Number);

        let versePairs: { source: string, target: string | null }[] = [];
        let verseRefs = await getVerseRefs(book, chapter, verse, n);

        for (let ref of verseRefs) {
            try {
                const sourceVerse = await findSourceVerseForContext(sourceTextFilePath, ref);
                const targetVerse = await findTargetVerse(ref);

                if (sourceVerse) {
                    versePairs.push({
                        source: sourceVerse,
                        target: targetVerse || null
                    });
                }
            } catch (error) {
                console.warn(`Error processing verse ${ref}: ${error}`);
            }
        }

        return JSON.stringify({ verse_pairs: versePairs }, null, 2);
    } catch (error) {
        console.error(`Error getting surrounding context for ${verseRef}`, error);
        throw error;
    }
}

async function getVerseRefs(book: string, chapter: number, verse: number, n: number): Promise<string[]> {
    let refs = [];
    let currentBook = book;
    let currentChapter = chapter;
    let currentVerse = verse;

    // Get preceding verses
    for (let i = 0; i < n; i++) {
        currentVerse--;
        if (currentVerse < 1) {
            currentChapter--;
            if (currentChapter < 1) {
                const previousBook = await getPreviousBook(currentBook);
                if (!previousBook) break;
                currentBook = previousBook;
                currentChapter = await getLastChapter(currentBook);
            }
            currentVerse = await getLastVerse(currentBook, currentChapter);
        }
        refs.unshift(`${currentBook} ${currentChapter}:${currentVerse}`);
    }

    // Reset to original verse
    currentBook = book;
    currentChapter = chapter;
    currentVerse = verse;
    refs.push(`${currentBook} ${currentChapter}:${currentVerse}`);

    // Get following verses
    for (let i = 0; i < Math.floor(n/2); i++) {
        currentVerse++;
        let lastVerse = await getLastVerse(currentBook, currentChapter);
        if (currentVerse > lastVerse) {
            currentChapter++;
            let lastChapter = await getLastChapter(currentBook);
            if (currentChapter > lastChapter) {
                const nextBook = await getNextBook(currentBook);
                if (!nextBook) break;
                currentBook = nextBook;
                currentChapter = 1;
            }
            currentVerse = 1;
        }
        refs.push(`${currentBook} ${currentChapter}:${currentVerse}`);
    }

    console.log({ refs });
    return refs;
}

async function findTargetVerse(verseRef: string): Promise<string | null> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        throw new Error('No workspace folder is open.');
    }

    const [book, chapterVerse] = verseRef.split(' ');
    const [chapter] = chapterVerse.split(':');

    const targetDir = path.join(workspaceFolders[0].uri.fsPath, 'files', 'target');
    const codexFile = path.join(targetDir, `${book}.codex`);

    try {
        const content = await fs.promises.readFile(codexFile, 'utf-8');
        const notebook = JSON.parse(content);

        // Find the cell with the correct chapter
        const chapterCell = notebook.cells.find((cell: any) => 
            cell.kind === 2 && 
            cell.language === 'scripture' && 
            cell.value.includes(`${book} ${chapter}:`)
        );

        if (!chapterCell) {
            console.warn(`Chapter ${chapter} not found in ${book}.codex`);
            return null;
        }

        const lines = chapterCell.value.split('\r\n');
        const targetLine = lines.find((line: any) => line.startsWith(verseRef));

        if (targetLine) {
            return targetLine.trim();
        }

        console.warn(`Verse ${verseRef} not found in ${book}.codex`);
        return null;
    } catch (error) {
        console.error(`Error reading or parsing ${book}.codex:`, error);
        return null;
    }
}

async function getPreviousBook(book: string): Promise<string | null> {
    const index = bookOrder.indexOf(book);
    if (index > 0) {
        return bookOrder[index - 1];
    }
    return null;
}

async function getNextBook(book: string): Promise<string | null> {
    const index = bookOrder.indexOf(book);
    if (index < bookOrder.length - 1) {
        return bookOrder[index + 1];
    }
    return null;
}

async function getLastChapter(book: string): Promise<number> {
    if (!sourceTextFilePath) {
        throw new Error('Source text file path is not initialized.');
    }
    const content = await fs.promises.readFile(sourceTextFilePath, 'utf-8');
    const lines = content.split('\n');
    let lastChapter = 0;
    for (const line of lines) {
        if (line.startsWith(book)) {
            const [, chapterVerse] = line.split(' ');
            const [chapter] = chapterVerse.split(':');
            lastChapter = Math.max(lastChapter, parseInt(chapter));
        }
    }
    return lastChapter;
}

async function getLastVerse(book: string, chapter: number): Promise<number> {
    if (!sourceTextFilePath) {
        throw new Error('Source text file path is not initialized.');
    }
    const content = await fs.promises.readFile(sourceTextFilePath, 'utf-8');
    const lines = content.split('\n');
    let lastVerse = 0;
    for (const line of lines) {
        if (line.startsWith(`${book} ${chapter}:`)) {
            const [, chapterVerse] = line.split(' ');
            const [, verse] = chapterVerse.split(':');
            lastVerse = Math.max(lastVerse, parseInt(verse));
        }
    }
    return lastVerse;
}

async function findSourceVerseForContext(sourceTextFilePath: string, verseRef: string): Promise<string> {
    const content = await fs.promises.readFile(sourceTextFilePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.startsWith(verseRef)) {
            return line.trim();
        }
    }
    throw new Error(`Verse ${verseRef} not found in the source text.`);
}

//completions
async function completeVerse(config: CompletionConfig, verseData: VerseData): Promise<string> {
    try {
        const messages = buildVerseMessages(verseData);
        return await makeCompletionRequest(config, messages, verseData.currentVerse);
    } catch (error) {
        console.error("Error completing verse", error);
        throw error;
    }
}

function buildVerseMessages(verseData: VerseData) {
    return [
        {
            role: "system",
            content: `You are an expert translator specializing in translating biblical texts from ${verseData.sourceLanguageName} to a target language. Your task is to complete the translation of a specific verse based on the provided context and resources. Some resources may be unavailable, but please provide the best translation possible with the given information.

            Guidelines:
            1. Use the 'source verse' as the primary text to translate, if available.
            2. Refer to the 'similar pairs' for guidance on vocabulary and phrasing in the target language, if available.
            3. Consider the 'surrounding context' to ensure your translation fits within the broader narrative, if available.
            4. Use the 'source chapter' and 'current translation' for additional context if needed and if available.
            5. Incorporate relevant information from 'other resources' if provided and available.
            6. Complete only the missing part of the 'current verse'.
            7. Maintain the style and tone consistent with biblical texts.
            8. Do not add any commentary or explanation to your translation.
            9. If crucial information is missing, provide the best possible translation based on available context.`
        },
        {
            role: "user",
            content: `Please complete the translation of the following verse:

            Source Language: ${verseData.sourceLanguageName}
            Verse Reference: ${verseData.verseRef}
            Source Verse: ${verseData.sourceVerse}
            Current (Partial) Translation: ${verseData.currentVerse}
            
            Similar Translation Pairs:
            ${verseData.similarPairs}
            
            Surrounding Context:
            ${verseData.surroundingContext}
            
            Additional Resources:
            ${verseData.otherResources}
            
            Please provide only the completed part of the translation, without repeating the reference or the already translated portion. If any crucial information is missing, please provide the best possible translation based on the available context.`
        }
    ];
}

async function completeChapter(
    document: vscode.TextDocument,
    position: vscode.Position,
    config: CompletionConfig,
    verseData: VerseData
): Promise<string> {
    //FIXME: this implementation is stupid
    try {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active text editor');
        }

        let currentLine = position.line;
        let lines = document.getText().split('\n');
        let completedText = "";

        while (currentLine < lines.length) {
            let lineText = lines[currentLine].trim();
            if (lineText.match(/^[A-Z]{3} \d+:\d+/)) {
                const messages = buildVerseMessages({ ...verseData, currentVerse: lineText });
                let completedVerse = await makeCompletionRequest(config, messages, lineText);

                await editor.edit(editBuilder => {
                    const lineEnd = new vscode.Position(currentLine, lines[currentLine].length);
                    editBuilder.insert(lineEnd, completedVerse);
                });

                completedText += completedVerse + "\n";
                currentLine++;
            } else if (lineText === '') {
                break;
            } else {
                currentLine++;
            }
        }

        return completedText;
    } catch (error) {
        console.error("Error completing chapter", error);
        throw error;
    }
}

//response and formatting
async function makeCompletionRequest(config: CompletionConfig, messages: any, currentVerse: string): Promise<string> {
    try {
        const url = config.endpoint + "/chat/completions";
        const data = {
            max_tokens: config.maxTokens,
            temperature: config.temperature,
            model: config.model,
            stream: false,
            messages,
            stop: ["\n\n", "\r\r", "\r\n\r", "\n\r\n"],
        };
        const headers = {
            "Content-Type": "application/json",
            Authorization: "Bearer " + config.apiKey,
        };

        const response = await axios.post(url, data, { headers });
        if (response.data?.choices?.length > 0) {
            const completedText = formatCompletionResponse(response.data.choices[0].message.content, currentVerse);
            if (completedText.trim() === "") {
                throw new Error("Empty completion response");
            }
            return completedText;
        }
        throw new Error("No choices in completion response");
    } catch (error) {
        console.error("Error making completion request", error);
        if (axios.isAxiosError(error)) {
            throw new Error(`API request failed: ${error.message}`);
        }
        if (error instanceof Error) {
            throw new Error(`Completion request failed: ${error.message}`);
        } else {
            throw new Error("Completion request failed due to an unknown error");
        }
    }
}

function formatCompletionResponse(text: string, currentVerse: string): string {
    let formattedText = text.startsWith("```") ? text.replace(/^```[\s\S]*?```/, '').trim() : text;
  
    if (text.startsWith(currentVerse) || text.startsWith(`"${currentVerse}`)) {
        formattedText = text.startsWith(`"`) 
            ? text.substring(currentVerse.length + 1, text.length - 1)
            : text.substring(currentVerse.length);
    }

    return formattedText;
}

// Export the necessary functions and variables
export {
    initializeConfig,
    initializeSourceTextFile,
    getCompletionConfig,
    getCompletionText,
    getVerseData,
    completeVerse,
    completeChapter,
    buildVerseMessages,
    makeCompletionRequest,
    formatCompletionResponse,
    readMetadataJson,
    findVerseRef,
    findSourceVerse,
    preprocessDocument,
    extractCurrentVerse,
    extractContextVerses,
    getSimilarPairs
};