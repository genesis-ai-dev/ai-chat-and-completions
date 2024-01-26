import * as vscode from "vscode";
const axios = require("axios");

let config = vscode.workspace.getConfiguration("translators-copilot");
let endpoint = config.get("llmEndpoint"); // NOTE: config.endpoint is reserved so we must have unique name
let apiKey = config.get("api_key");
let model = config.get("model");
let temperature = config.get("temperature");
let maxTokens = config.get("max_tokens");
let maxLength = 4000;
let shouldProvideCompletion = false;
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

// Preprocess the document
function preprocessDocument(docText: string) {
  // Split all lines
  let lines = docText.split("\r\n");
  // Apply preprocessing rules to each line
  for (let i = 0; i < lines.length; i++) {
    if (i > 0 && lines[i - 1].trim() !== "" && isStartWithComment(lines[i])) {
      lines[i] = "\r\n" + lines[i];
    }
  }
  // Merge all lines
  return lines.join("\r\n");
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
async function getCompletionText(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  let language = document.languageId;
  let textBeforeCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
  textBeforeCursor =
    textBeforeCursor.length > maxLength
      ? textBeforeCursor.substr(textBeforeCursor.length - maxLength)
      : textBeforeCursor;

  // Preprocess the document before the cursor
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
    return;
  }

  let data: {
    prompt: string;
    max_tokens: number;
    temperature: unknown;
    stream: boolean;
    stop: string[];
    n: number;
    model: {} | undefined;
  } = {
    prompt: prompt,
    max_tokens: 256,
    temperature: temperature,
    stream: false,
    stop: stop,
    n: 2,
    model: undefined,
  };
  if (model) {
    data.model = model;
  }
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    // @ts-ignore
    headers["Authorization"] = "Bearer " + apiKey;
  }
  let config = {
    method: "POST",
    url: endpoint + "/completions",
    headers,
    data: JSON.stringify(data),
  };

  try {
    const response = await axios.request(config);
    if (
      response &&
      response.data &&
      response.data.choices &&
      response.data.choices.length > 0
    ) {
      return response.data.choices[0].text.replace(/[\r\n]+$/g, "");
    }
  } catch (error: any) {
    console.log("Error:", error.message);
    vscode.window.showErrorMessage("Service access failed.");
  }
}

async function getCompletionTextGPT(
  document: vscode.TextDocument,
  position: vscode.Position
) {
  vscode.window.showInformationMessage("getCompletionTextGPT called");
  let textBeforeCursor = document.getText(
    new vscode.Range(new vscode.Position(0, 0), position)
  );
  textBeforeCursor =
    textBeforeCursor.length > maxLength
      ? textBeforeCursor.substr(textBeforeCursor.length - maxLength)
      : textBeforeCursor;
  textBeforeCursor = preprocessDocument(textBeforeCursor);
  const url = endpoint + "/chat/completions";
  console.log({ url });
  const messages = [
    {
      role: "system",
      content:
        "No communication! Just continue writing the code provided by the user.",
    },
    { role: "user", content: textBeforeCursor },
  ];
  const data = {
    max_tokens: maxTokens,
    temperature,
    model,
    stream: false,
    messages,
    stop: ["\n\n", "\r\r", "\r\n\r", "\n\r\n"],
  };
  const headers = {
    "Content-Type": "application/json",
    Authorization: "Bearer " + apiKey,
  };
  let text = "";
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
      if (text.startsWith("```")) {
        const textLines = text.split("\n");
        const startIndex = textLines.findIndex((line) =>
          line.startsWith("```")
        );
        const endIndex = textLines
          .slice(startIndex + 1)
          .findIndex((line) => line.startsWith("```"));
        text =
          endIndex >= 0
            ? textLines
                .slice(startIndex + 1, startIndex + endIndex + 1)
                .join("\n")
            : textLines.slice(startIndex + 1).join("\n");
      }
    }
  } catch (error) {
    console.log("Error:", error);
    vscode.window.showErrorMessage("Service access failed.");
  }
  return text;
}

export function triggerInlineCompletion() {
  shouldProvideCompletion = true;
  vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
}
