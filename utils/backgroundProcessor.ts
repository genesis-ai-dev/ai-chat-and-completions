import * as vscode from 'vscode';
import { CompletionConfig, getCompletionConfig, findVerseRef } from './inlineCompletionProvider';
import { getVerseData, VerseData } from './verseCompletion';

class BackgroundProcessor {
    private static instance: BackgroundProcessor;
    private cache: Map<string, VerseData> = new Map();
    private currentVerse: string = '';
    private config: CompletionConfig | null = null;

    private constructor() {}

    public static getInstance(): BackgroundProcessor {
        if (!BackgroundProcessor.instance) {
            BackgroundProcessor.instance = new BackgroundProcessor();
        }
        return BackgroundProcessor.instance;
    }

    public async initialize(): Promise<void> {
        this.config = await getCompletionConfig();
        this.registerEventListeners();
    }

    public async refreshConfig(): Promise<void> {
        this.config = await getCompletionConfig();
    }

    private registerEventListeners(): void {
        vscode.workspace.onDidChangeTextDocument(this.handleDocumentChange.bind(this));
    }

    private async handleDocumentChange(event: vscode.TextDocumentChangeEvent): Promise<void> {
        if (!this.config?.enableBackgroundProcessing) {
            return;
        }
        
        const currentLine = this.getCurrentLine(event.document, event.contentChanges[0].range.start.line);
        const verseRef = await findVerseRef();

        if (verseRef && verseRef !== this.currentVerse) {
            this.currentVerse = verseRef;
            this.processVerseData(event.document, event.contentChanges[0].range.start);
        }
    }

    private getCurrentLine(document: vscode.TextDocument, lineNumber: number): string {
        return document.lineAt(lineNumber).text;
    }

    private async processVerseData(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
        if (this.config?.completionMode !== 'verse') {
            return;
        }

        try {
            console.log('Refreshing background data for verse:', this.currentVerse);
            const verseData = await getVerseData(this.config, document, position);
            this.cache.set(this.currentVerse, verseData);
        } catch (error) {
            console.error('Error processing verse data:', error);
        }
    }

    public getCachedVerseData(verseRef: string): VerseData | undefined {
        return this.cache.get(verseRef);
    }
}

export const backgroundProcessor = BackgroundProcessor.getInstance();