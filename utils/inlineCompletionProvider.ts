import * as vscode from "vscode";

const axios = require("axios");

// Retrieve configuration settings specific to translators-copilot
let config = vscode.workspace.getConfiguration("translators-copilot");
let endpoint = config.get("llmEndpoint");
let apiKey = config.get("api_key");
let model = config.get("model");
let temperature = config.get("temperature");
let maxTokens = config.get("max_tokens");
let maxLength = 4000;
let shouldProvideCompletion = false;

// Function to provide inline completion items in the editor
export async function provideInlineCompletionItems(
  document: vscode.TextDocument,
  position: vscode.Position,
  context: vscode.InlineCompletionContext,
  token: vscode.CancellationToken
): Promise<vscode.InlineCompletionItem[] | undefined> {
  vscode.window.showInformationMessage("provideInlineCompletionItems called");
  if (!shouldProvideCompletion) {
    return undefined;
  }
  // Determine the appropriate text based on the model and endpoint
  const text =
    (model as string).startsWith("gpt") &&
    ((endpoint as string).startsWith("https://api") ||
      (endpoint as string).startsWith("https://localhost"))
      ? await getCompletionTextGPT(document, position)
      : await getCompletionText(document, position);
  let completionItem = new vscode.InlineCompletionItem(
    text,
    new vscode.Range(position, position)
  );
  completionItem.range = new vscode.Range(position, position);
  shouldProvideCompletion = false;
  return [completionItem];
}

// Function to find verse reference from shared state store
async function findVerseRef() {
  let verseRef;
  // Attempt to retrieve the verse reference from the shared state store
  const sharedStateExtension = vscode.extensions.getExtension("project-accelerate.shared-state-store");
  if (sharedStateExtension) {
    try {
      const sharedStateStore = sharedStateExtension.exports;
      const verseRefObject = await sharedStateStore.getStoreState("verseRef");
      verseRef = verseRefObject?.verseRef;
    } catch (error) {
      console.error("Failed to access shared state store:", error);
    }
  } else {
    console.warn("Extension 'project-accelerate.shared-state-store' not found.");
  }
  return verseRef;
}

// Function to read the source language Bible file and find the verse
async function findSourceVerse(sourceFile: string, verseRef: string): Promise<string | undefined> {
  try {
    // Get the workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder is open.');
      return undefined;
    }

    // Construct the full URI to the source language Bible file
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, "./.project/sourceTextBibles/" + sourceFile);
    console.log({ fileUri });

    // Read the file contents
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const fileContents = Buffer.from(fileData).toString('utf-8');

    // Find the verse that starts with verseRef
    const verseRegex = new RegExp(`^${verseRef}.*$`, 'm');
    const match = fileContents.match(verseRegex);
    if (match) {
      return match[0];
    } else {
      vscode.window.showErrorMessage(`Verse ${verseRef} not found in the source language Bible.`);
      return undefined;
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading source language Bible: ${error}`);
    return undefined;
  }
}

// Preprocess the document
function preprocessDocument(docText: string) {
  // Split all lines
  let lines = docText.split("\r\n");
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && lines[i - 1].trim() !== "" && isStartWithComment(lines[i])) {
      lines[i] = "\r\n" + lines[i];
    }
  }
  return lines.join("\r\n");
  // Helper function to check if a line starts with a comment
  function isStartWithComment(line: string): boolean {
    let trimLine = line.trim();
    // Define a list of comment start symbols
    let commentStartSymbols = ["//", "#", "/*", "<!--", "{/*"];
    for (let symbol of commentStartSymbols) {
      if (trimLine.startsWith(symbol)) return true;
    }
    return false;
  }
}

// Function to get completion text from the API
async function getCompletionText(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  // Retrieve the language ID of the document
  let language = document.languageId;
  // Extract text from the start of the document to the current cursor position
  let textBeforeCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
  // Ensure the text length does not exceed the maximum allowed length
  textBeforeCursor =
    textBeforeCursor.length > maxLength
      ? textBeforeCursor.substr(textBeforeCursor.length - maxLength)
      : textBeforeCursor;

  // Preprocess the document to handle line breaks and comments correctly
  textBeforeCursor = preprocessDocument(textBeforeCursor);

  // Initialize variables for API request
  let prompt = "";
  let stop = ["\n\n", "\r\r", "\r\n\r", "\n\r\n", "```"];

  // Get the content of the current line up to the cursor position
  let lineContent = document.lineAt(position.line).text;
  let leftOfCursor = lineContent.substr(0, position.character).trim();
  // Add a stop condition if there is content left of the cursor
  if (leftOfCursor !== "") {
    stop.push("\r\n");
  }

  // Construct the prompt for the API if there is text before the cursor
  if (textBeforeCursor) {
    prompt = "```" + language + "\r\n" + textBeforeCursor;
    console.log({ prompt });
  } else {
    return;
  }

  // Set up data payload for the API request
  let data = {
    prompt: prompt,
    max_tokens: 256,
    temperature: temperature,
    stream: false,
    stop: stop,
    n: 2,
    model: model || undefined, // Ensure model is either a string or undefined
  };
  // Configure headers for the API request
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    // @ts-ignore
    headers["Authorization"] = "Bearer " + apiKey;
  }
  // Configure the API request
  let config = {
    method: "POST",
    url: endpoint + "/completions",
    headers,
    data: JSON.stringify(data),
  };

  // Execute the API request and handle the response
  try {
    const response = await axios.request(config);
    if (
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      // Return the text from the first choice, trimming any trailing newlines
      return response.data.choices[0].text.replace(/[\r\n]+$/g, "");
    }
  } catch (error: any) {
    console.log("Error:", error.message);
    vscode.window.showErrorMessage("Service access failed.");
  }
}

// Function to get completion text from GPT model
async function getCompletionTextGPT(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  
  //reads the metadata.json file from the project workspace
  const metadata = await readMetadataJson();
  console.log("Read metadata!");
  // //finds the source language from the metadata.json file
  // const sourceLanguageName = metadata.languages.find((lang: any) => lang.projectStatus === 'source')?.refName || undefined;
  // console.log({ sourceLanguageRefName: sourceLanguageName });
  //finds the target language from the metadata.json file
  const targetLanguageName = metadata.languages.find((lang: any) => lang.projectStatus === 'target')?.refName || undefined;
  console.log({ targetLanguageRefName: targetLanguageName });

  let verseRef = await findVerseRef();
  console.log("Verse Reference:", verseRef);
  
  let sourceVerse = "";

  // Finds the source verse from the source language Bible file
  if (verseRef) {
    const foundSourceVerse = await findSourceVerse("eng-eng-asv.bible", verseRef); //replace with the source language Bible file!
    if (foundSourceVerse) {
      sourceVerse = foundSourceVerse;
      console.log({ sourceVerse });
    }
  }

  // Display a message in the editor to indicate that GPT text retrieval is called
  vscode.window.showInformationMessage("getCompletionTextGPT called");
  // Extract text from the start of the document to the current cursor position
  let textBeforeCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
  // Ensure the text length does not exceed the maximum allowed length
  textBeforeCursor =
    textBeforeCursor.length > maxLength
      ? textBeforeCursor.substr(textBeforeCursor.length - maxLength)
      : textBeforeCursor;
  // Preprocess the document to handle line breaks and comments correctly
  textBeforeCursor = preprocessDocument(textBeforeCursor);
  console.log({ textBeforeCursor });

  //currentVerse is everything after the verse reference
  let currentVerse = "";
  if (verseRef) {
    const verseRefPosition = textBeforeCursor.indexOf(verseRef);
    if (verseRefPosition !== -1) {
      currentVerse = verseRef + textBeforeCursor.substring(verseRefPosition + verseRef.length);
    }
  }
  console.log({ currentVerse });

  //context is everything before the verse reference without any references included
  let context = textBeforeCursor.substring(0, textBeforeCursor.indexOf(verseRef));
  if (verseRef) {
    const bookCode = verseRef.substring(0, 3);
    const regexPattern = new RegExp("(" + bookCode + " \\d+:\\d+\\s*)+$", "g");
    context = context.replace(regexPattern, '');
  }
  console.log({ context });

  // Define the API endpoint for GPT completions
  const url = endpoint + "/chat/completions";
  console.log({ url });
  // Set up the messages payload for the API request
  const messages = [
    {
      role: "system",
      content: "No communication! You are a ghost-writing text completion system for Bible translation software. Your are to complete the Bible verse that the user has already begun translating specified as 'current verse'. Consider the style of the 'sample text' provided by the user which may or may not be relevant.\n\n" +
      "Steps:\n 1. Translate the 'source verse' to the 'current verse' in the " + targetLanguageName + " language.\n 2. DO NOT USE QUOTATION MARKS AROUND YOUR RESPONSE UNLESS THEY ARE PRESENT IN YOUR SOURCE LANGUAGE TEXT!\n 3. Do not include the portion of the 'current verse' that has already been translated in your response.",
    },
    {
      role: "user",
      content: "'sample text': \"" + context + "\", 'source verse': \"" + sourceVerse + "\", 'current verse': \"" + currentVerse + "\""
    },
  ];
  console.log({ messages });

  // Set up data payload for the API request
  const data = {
    max_tokens: maxTokens,
    temperature,
    model,
    stream: false,
    messages,
    stop: ["\n\n", "\r\r", "\r\n\r", "\n\r\n"],
  };
  // Configure headers for the API request
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + apiKey,
  };
  let text = "";
  let formattedText = "";
  // Execute the API request and handle the response
  try {
    const config = {
      method: "POST",
      url,
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

      text = response.data.choices[0].message.content;
      console.log({ text });

      // Remove leading and trailing markdown code block indicators if present
      if (text.startsWith("```")) {
        formattedText = text.replace(/^```[\s\S]*?```/, '').trim();
      }

      //remove leading verse text and global quotation marks
      if (text.startsWith(currentVerse) || text.startsWith("\"" + currentVerse)) {
        if (text.startsWith("\"")) {
          formattedText = text.substring(currentVerse.length + 1, text.length - 1);
        } else {
          formattedText = text.substring(currentVerse.length);
        }
      } else {
        formattedText = text;
      }

      console.log({ formattedText });

    }
  } catch (error: any) {
    console.log("Error:", error.message);
    console.log("Error details:", error.response ? error.response.data : error);
    vscode.window.showErrorMessage("Service access failed: " + error.message);
  }
  return formattedText;
}


// Function to trigger inline completion manually
export function triggerInlineCompletion() {
  // Set the flag to indicate that completion should be provided
  shouldProvideCompletion = true;
  // Execute the command to trigger inline suggestion
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
}

// Function to read and parse metadata.json from the workspace
async function readMetadataJson(): Promise<any | undefined> {
  try {
    // Get the workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder is open.');
      return;
    }

    // Construct the full URI to the file
    const fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, "./metadata.json");
    console.log({ fileUri });

    // Read the file contents
    const fileData = await vscode.workspace.fs.readFile(fileUri);
    const fileContents = Buffer.from(fileData).toString('utf-8');

    // Parse the JSON contents
    const jsonData = JSON.parse(fileContents);
    return jsonData;
  } catch (error) {
    vscode.window.showErrorMessage(`Error reading metadata.json: ${error}`);
    return;
  }
}