import * as vscode from "vscode";
import { getUri } from "../utilities/get-uri";
import { getNonce } from "../utilities/get-nonce";
import { askToChatGptAsStream } from "../utilities/chat-gpt.service";

/**
 * Webview panel class
 */
export class ChatGptPanel {
    public static currentPanel: ChatGptPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _context: vscode.ExtensionContext;

    /**
     * 
     * @param context is a parameter that is typeoff vscode.ExtensionContext.
     * @param panel is a parameter thatis typeoff vscode.WebviewPanel.
     * @param extensionUri is a string parameter of vscode.Uri.
     */
    private constructor(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._context = context;
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._setWebviewMessageListener(this._panel.webview);

        // Read the api key from globalState and send it to webview
        const existApiKey = this.getApiKey();
        this._panel.webview.postMessage({ command: 'api-key-exist', data: existApiKey });
    }

    /**
     * Render method of webview that is triggered from "extension.ts" file.
     * @param context context is a parameter that is typeoff vscode.ExtensionContext.
     */
    public static render(context: vscode.ExtensionContext) {

        // if exist show 
        if (ChatGptPanel.currentPanel) {
            ChatGptPanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else { // if not exist create a new one.

            const extensionUri: vscode.Uri = context.extensionUri;
            const panel = vscode.window.createWebviewPanel("vscode-chat-gpt", "ChatGpt", vscode.ViewColumn.One, {
                // Enable javascript in the webview.
                enableScripts: true,
                // Restrict the webview to only load resources from the `out` directory.
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')]
            });

            ChatGptPanel.currentPanel = new ChatGptPanel(context, panel, extensionUri);
        }
    }

    /**
     * Dispose panel.
     */
    public dispose() {
        ChatGptPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    /**
     * Add listeners to catch messages from webview js.
     * @param webview is a parameter that is typeoff vscode.Webview.
     */
    private _setWebviewMessageListener(webview: vscode.Webview) {
        webview.onDidReceiveMessage(
            (message: any) => {
                const command = message.command;

                switch (command) {
                    case "press-ask-button":
                        const existApiKey = this.getApiKey();
                        if (existApiKey == undefined || existApiKey == null || existApiKey == '') {
                            vscode.window.showInformationMessage('Please add your ChatGpt api key!');
                            this._panel.webview.postMessage({ command: 'error', data: '' });
                        } {
                            askToChatGptAsStream(message.text, existApiKey).subscribe(answer => {
                                this._panel.webview.postMessage({ command: 'answer', data: answer });
                            });
                        }
                        return;
                    case "press-save-api-key-button":
                        this.setApiKey(message.text);
                        const responseMessage = `${message.text} : api key saved successfully.`;
                        vscode.window.showInformationMessage(responseMessage);
                        return;

                    case "press-clear-api-key-button":
                        this.setApiKey('');

                        const claerResponseMessage = 'api key cleared successfully';
                        vscode.window.showInformationMessage(claerResponseMessage);

                        return;
                }
            },
            undefined,
            this._disposables
        );
    }

    /**
     * 
     * @param webview is a parameter that is typeoff vscode.Webview.
     * @param extensionUri is a string parameter of vscode.Uri.
     * @returns 
     */
    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {

        // get uris from out directory based on vscode.extensionUri
        const webviewUri = getUri(webview, extensionUri, ["out", "webview.js"]);
        const nonce = getNonce();
        const stylesMainPath = getUri(webview, extensionUri, ['out', 'style.css']);
        const logoMainPath = getUri(webview, extensionUri, ['out', 'chat-gpt-logo-2-HBRQ6ZBV.jpeg']);

        // Tip: Install the es6-string-html VS Code extension to enable code highlighting below
        return /*html*/ `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
            <link href="${stylesMainPath}" rel="stylesheet">
            <link rel="icon" type="image/jpeg" href="${logoMainPath}">
            <title>ChatGpt Assistant</title>
          </head>
          <body>
            <h1>Ask to ChatGpt!</h1>
            <vscode-text-field id="api-key-text-field-id" size="150">Api Key:</vscode-text-field>
            <div class="flex-container">
                <vscode-button id="api-key-save-button-id">Save</vscode-button>
                <vscode-button class="danger" id="api-key-clear-button-id">Clear</vscode-button>
            </div>
            <vscode-divider role="separator"></vscode-divider>
            <div class="flex-container-logo">
              <span>
                <img class="logo-image" src="${logoMainPath}">
              </span>
              <span class="answer-header"> Answer : </span>
            </div>
            <pre><code class="code" id="answers-id"></code></pre>
            <vscode-text-area class="text-area" id="question-text-id" cols="100" autofocus>Question</vscode-text-area>
            <div class="flex-container">
              <vscode-button id="ask-button-id">Ask</vscode-button>
              <vscode-button class="danger" id="clear-button-id">Clear</vscode-button>
              <vscode-progress-ring id="progress-ring-id"></vscode-progress-ring>
            </div>
            <script type="module" nonce="${nonce}" src="${webviewUri}"></script>
          </body>
        </html>
        `;
    }

    /**
     * Set api key into context.globalState
     * @param apikeyValue is a string parameter of ChatGpt api key.
     * @returns void.
     */
    private setApiKey(apikeyValue: string | undefined) {
        const state = this.stateManager(this._context);

        if (apikeyValue !== undefined) {
            state.write({
                apiKey: apikeyValue
            });
        }
    }

    /**
     * Get api key from context.globalState.
     * @returns string api key.
     */
    private getApiKey(): string {
        const state = this.stateManager(this._context);

        const { apiKeyApplied } = state.read();
        return apiKeyApplied as string;
    }

    /**
     * State Manager has read and write methods for api key. This methods set and get the api key from context.globalState.
     * @param context is a parameter that is typeoff vscode.ExtensionContext.
     * @returns void.
     */
    private stateManager(context: vscode.ExtensionContext) {
        return {
            read,
            write
        };

        function read() {
            return {
                apiKeyApplied: context.globalState.get('apiKey')
            };
        }

        function write(newState: any) {
            context.globalState.update('apiKey', newState.apiKey);
        }
    }
}