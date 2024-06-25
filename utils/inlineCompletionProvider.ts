import * as vscode from "vscode";
import axios from "axios";
import * as fs from 'fs';
import * as path from 'path';
import { PythonMessenger } from "./pyglsMessenger";
import { Logger } from './logger';
import { ConfigurationError, APIError, FileSystemError, PythonMessengerError } from './errors';
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
}

const pyMessenger = new PythonMessenger();
const maxLength = 4000;
const similarPairsCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
let sourceTextFile = "";
let shouldProvideCompletion = false;

let config = vscode.workspace.getConfiguration("translators-copilot");

async function initializeConfig() {
    try {
        config = vscode.workspace.getConfiguration("translators-copilot");
        Logger.log("Configuration initialized successfully");
    } catch (error) {
        Logger.error("Error initializing configuration", error);
        throw new ConfigurationError("Failed to initialize configuration");
    }
}

async function initializeSourceTextFile() {
    try {
        sourceTextFile = await findSourceText() || "";
        Logger.log(`Source text file initialized: ${sourceTextFile}`);
    } catch (error) {
        Logger.error("Error initializing source text file", error);
        throw new FileSystemError("Failed to initialize source text file");
    }
}

async function findSourceText(): Promise<string | undefined> {
    try {
        const configuredFile = config.get("sourceTextFile") as string;
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error("No workspace folders found");
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, "./.project/sourceTextBibles/");
        const files = await vscode.workspace.fs.readDirectory(fileUri);
        const bibleFiles = files.filter(file => file[0].endsWith('.bible')).map(file => file[0]);

        if (configuredFile && bibleFiles.includes(configuredFile)) {
            return configuredFile;
        }

        return bibleFiles.length > 0 ? bibleFiles[0] : undefined;
    } catch (error) {
        Logger.error("Error finding source text", error);
        throw new FileSystemError("Failed to find source text file");
    }
}

export async function provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[] | undefined> {
    try {
        if (!shouldProvideCompletion) {
            return undefined;
        }

        const completionConfig = await getCompletionConfig();
        const text = (completionConfig.model.startsWith("gpt") && (completionConfig.endpoint.startsWith("https://api") || completionConfig.endpoint.startsWith("https://localhost")))
            ? await getCompletionTextGPT(document, position)
            : await getCompletionText(document, position);

        let completionItem = new vscode.InlineCompletionItem(
            text,
            new vscode.Range(position, position)
        );
        completionItem.range = new vscode.Range(position, position);
        shouldProvideCompletion = false;
        return [completionItem];
    } catch (error) {
        Logger.error("Error providing inline completion items", error);
        vscode.window.showErrorMessage("Failed to provide inline completion. Check the output panel for details.");
        return undefined;
    }
}

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
        Logger.error("Error getting completion configuration", error);
        throw new ConfigurationError("Failed to get completion configuration");
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
        Logger.error("Error getting completion text", error);
        if (axios.isAxiosError(error)) {
            throw new APIError(`API request failed: ${error.message}`, error.response?.status);
        }
        throw error;
    }
}

export async function getCompletionTextGPT(
    document: vscode.TextDocument,
    position: vscode.Position
): Promise<string> {
    try {
        const config = await getCompletionConfig();
        const verseData = await getVerseData(document, position);
    
        switch (config.completionMode) {
            case "verse":
                return await completeVerse(config, verseData);
            case "chapter":
                return await completeChapter(document, position, config, verseData);
            case "token":
                Logger.log("Completing as much as the token limit permits.");
                return "token completion logic not implemented yet.";
            default:
                Logger.error("Unknown completion mode", { mode: config.completionMode });
                throw new ConfigurationError(`Unknown completion mode: ${config.completionMode}`);
        }
    } catch (error) {
        Logger.error("Error in getCompletionTextGPT", error);
        throw error;
    }
}

async function getVerseData(document: vscode.TextDocument, position: vscode.Position): Promise<VerseData> {
    try {
        const metadata = await readMetadataJson();
        const sourceLanguageName = metadata.languages.find((lang: any) => lang.projectStatus === 'source')?.refName || "";
        const verseRef = await findVerseRef() || "";
        const sourceVerse = await findSourceVerse(sourceTextFile, verseRef);
    
        const textBeforeCursor = preprocessDocument(document.getText(new vscode.Range(new vscode.Position(0, 0), position)));
        const currentVerse = extractCurrentVerse(textBeforeCursor, verseRef);
        const contextVerses = extractContextVerses(textBeforeCursor, verseRef);
        const similarPairs = await getSimilarPairs(verseRef);
    
        return {
            sourceLanguageName,
            verseRef,
            sourceVerse,
            currentVerse,
            contextVerses,
            similarPairs,
            otherResources: "No further resources available.",
        };
    } catch (error) {
        Logger.error("Error getting verse data", error);
        throw error;
    }
}

async function completeVerse(config: CompletionConfig, verseData: VerseData): Promise<string> {
    try {
        const messages = buildVerseMessages(verseData);
        return await makeCompletionRequest(config, messages, verseData.currentVerse);
    } catch (error) {
        Logger.error("Error completing verse", error);
        throw error;
    }
}

async function completeChapter(
    document: vscode.TextDocument,
    position: vscode.Position,
    config: CompletionConfig,
    verseData: VerseData
): Promise<string> {
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
        Logger.error("Error completing chapter", error);
        throw error;
    }
}

function buildVerseMessages(verseData: VerseData) {
    return [
        {
            role: "system",
            content: `Role: You are an expert translator specializing in translating biblical texts from ${verseData.sourceLanguageName} into new languages you do not know!

            Context: The user will provide a verse from the Bible in ${verseData.sourceLanguageName}, and you will finish translating it based on the json formatted 'source-target' translation pairs and optional other resources provided by the user.
      
            Guidelines:
            - Learn the target language from all resources provided by the user.
            - From the 'source verse', complete the translation of the 'current verse' in the target language accordingly, drawing especially from the 'source-target' pairs.
            - Do not provide extraneous information or commentary in your response.
      
            Example:
            Input: 
            "source-target: [json file of source-target translation pairs],
            "other resources: [optional json file of additional resources],

            "source verse: "GEN 1:1 In the beginning God created the heaven and the earth.",
            "current verse: "GEN 1:1 Andre začiatkos o"
            Output: "GEN 1:1 Andre začiatkos o Del kerdžas o ňebos the e phuv."`
        },
        {
            role: "user",
            content: `Finish the current verse with your translation of the source verse in the target language. Exclude single or double quotation marks from your response. Exclude any completed part of the current verse in your response.

            source-target: ${verseData.similarPairs}
            other resources: ${verseData.otherResources}
            source verse: ${verseData.sourceVerse}
            current verse: ${verseData.currentVerse}`
        }
    ];
}

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
            return formatCompletionResponse(response.data.choices[0].message.content, currentVerse);
        }
        return "";
    } catch (error) {
        Logger.error("Error making completion request", error);
        if (axios.isAxiosError(error)) {
            throw new APIError(`API request failed: ${error.message}`, error.response?.status);
        }
        throw error;
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
        Logger.error("Error reading metadata.json", error);
        throw new FileSystemError(`Error reading metadata.json: ${error}`);
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
            Logger.log("Extension 'project-accelerate.shared-state-store' not found.");
            return undefined;
        }
    } catch (error) {
        Logger.error("Failed to access shared state store", error);
        throw error;
    }
}

async function findSourceVerse(sourceTextFile: string, verseRef: string): Promise<string> {
    try {
        if (!sourceTextFile) {
            throw new Error('Source file not specified.');
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('No workspace folder is open.');
        }
        const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, "./.project/sourceTextBibles/", sourceTextFile);
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
        Logger.error("Error reading source language Bible", error);
        throw new FileSystemError(`Error reading source language Bible: ${error}`);
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
        Logger.error("Error preprocessing document", error);
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
        similarPairsCache.set(cacheKey, result);
        return result;
    } catch (error) {
        if (error instanceof PythonMessengerError) {
            Logger.warn(`Python server unavailable: ${error.message}`);
            return "Similar verse pairs currently unavailable.";
        } else {
            Logger.error("Error getting similar pairs", error);
            return "No verse pairs available.";
        }
    }
}

export async function triggerInlineCompletion() {
    try {
        shouldProvideCompletion = true;
        await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    } catch (error) {
        Logger.error("Error triggering inline completion", error);
        if (error instanceof ConfigurationError) {
            vscode.window.showErrorMessage(`Configuration error: ${error.message}. Please check your settings.`);
        } else if (error instanceof APIError) {
            vscode.window.showErrorMessage(`API error (${error.statusCode}): ${error.message}. Please try again later.`);
        } else {
            vscode.window.showErrorMessage(`An unexpected error occurred: ${error}`);
        }
    } finally {
        shouldProvideCompletion = false;
    }
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