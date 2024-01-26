import * as vscode from 'vscode'
const fs = require("fs");
const path = require("path");

let config = vscode.workspace.getConfiguration("translators-copilot");
let endpoint = config.get("llmEndpoint"); // NOTE: config.endpoint is reserved so we must have unique name
let apiKey = config.get("api_key");
let model = config.get("model");
let maxTokens = config.get("max_tokens");
let temperature = config.get("temperature");
let maxLength = 4000;
let abortController: AbortController | null = null;

const loadWebviewHtml = (webviewView: vscode.WebviewView, extensionUri: vscode.Uri) => {
  webviewView.webview.options = {
    enableScripts: true,
    localResourceRoots: [
      vscode.Uri.file(path.join(extensionUri.fsPath, "dist")),
    ],
  };

  const indexPath = path.join(extensionUri.fsPath, "dist", "index.html");
  let htmlContent = fs.readFileSync(indexPath, "utf-8");

  const resourceRegEx = /<(script|link).*?(src|href)="([^"]*?)".*?\/?>/g;
  htmlContent = htmlContent.replace(
    resourceRegEx,
    (match: string, tag: string, attribute: string, src: string) => {
      const resourcePath = vscode.Uri.file(
        path.join(extensionUri.fsPath, "dist", src)
      );
      console.log({ resourcePath });
      const resourceUri = webviewView.webview.asWebviewUri(resourcePath);
      return `<${tag} ${attribute}="${resourceUri}" ${
        tag === "link" ? 'rel="stylesheet"' : ""
      }></${tag}>`;
    }
  );

  webviewView.webview.html = htmlContent;
};

const sendFinishMessage = (webviewView: vscode.WebviewView) => {
  webviewView.webview.postMessage({
    command: "response",
    finished: true,
    text: "",
  });
};

const processFetchResponse = (webviewView: vscode.WebviewView, response: Response) => {
  return new Promise<void>((resolve, reject) => {
    try {
      const reader = response?.body?.getReader();
      let decoder = new TextDecoder("utf-8");

      reader
        ?.read()
        .then(function processText({ done, value }): Promise<any|undefined> {
          if (done) {
            sendFinishMessage(webviewView);
            resolve();
            return Promise.resolve();
          }
          let chunk = decoder.decode(value);
          // Split using 'data:'
          let chunkArray = chunk.split("data:");
          chunkArray.forEach((jsonString) => {
            jsonString = jsonString.trim();
            // Check if the split string is empty
            if (jsonString.length > 0) {
              try {
                const payload = JSON.parse(jsonString);
                console.log("29u3089u", { payload });
                let payloadTemp = payload["choices"][0];
                let sendChunk = payloadTemp["message"]
                  ? payloadTemp["message"]["content"]
                  : payloadTemp["delta"]["content"];
                sendChunk &&
                  webviewView.webview.postMessage({
                    command: "response",
                    finished: false,
                    text: sendChunk,
                  });
              } catch (error) {
                console.log("Error:", error);
              }
            }
          });
          return reader.read().then(processText);
        })
        .catch(reject);
    } catch (error) {
      reject(error);
    }
  });
};

export class CustomWebviewProvider {
  _extensionUri: any;
  selectionChangeListener: any;
  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
  }

  sendSelectMessage(webviewView: vscode.WebviewView, selectedText: string) {
    const activeEditor = vscode.window.activeTextEditor;
    let languageId = "";
    if (activeEditor) {
      languageId = activeEditor.document.languageId;
    }
    // Shorten the length of selectedText
    if (selectedText.length > maxLength - 100) {
      selectedText = selectedText.substring(0, maxLength - 100);
    }
    const formattedCode =
      "```" + languageId + "\r\n" + selectedText + "\r\n```";
    webviewView.webview.postMessage({
      command: "select",
      text: selectedText ? formattedCode : "",
    });
  }

  saveSelectionChanges(webviewView: vscode.WebviewView) {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.selectionChangeListener =
        vscode.window.onDidChangeTextEditorSelection((e) => {
          if (e.textEditor === activeEditor) {
            const selectedText = activeEditor.document.getText(e.selections[0]);
            this.sendSelectMessage(webviewView, selectedText);
          }
        });
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    loadWebviewHtml(webviewView, this._extensionUri);
    webviewView.webview.postMessage({ command: "reload" });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        webviewView.webview.postMessage({ command: "reload" });
      }
    });

    this.saveSelectionChanges(webviewView);
    vscode.window.onDidChangeActiveTextEditor(() => {
      // When the active editor changes, remove the old listener and add a new one
      if (this.selectionChangeListener) {
        this.selectionChangeListener.dispose();
      }
      this.saveSelectionChanges(webviewView);
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      try {
        switch (message.command) {
          case "fetch":
             abortController = new AbortController();
            const url = endpoint + "/chat/completions";
            console.log({ url, endpoint, apiKey });
            const data = {
              max_tokens: maxTokens,
              temperature: temperature,
              stream: true,
              messages: JSON.parse(message.messages),
              model: undefined as any
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
            const response = await fetch(url, {
              method: "POST",
              headers,
              body: JSON.stringify(data),
              signal: abortController.signal,
            });
            await processFetchResponse(webviewView, response);
            break;
          case "abort-fetch":
            if (abortController) {
              abortController.abort();
            }
            break;
          default:
            break;
        }
      } catch (error) {
        sendFinishMessage(webviewView);
        console.error("Error:", error);
        vscode.window.showErrorMessage("Service access failed.");
      }
    });
  }
}
module.exports = {
  CustomWebviewProvider,
};
