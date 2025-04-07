import * as vscode from 'vscode';
import * as path from 'path';
import { GeminiService, ChatMessage } from '../services/GeminiService';
import { FileService } from '../services/FileService';
import { DiffService } from '../services/DiffService';
import { marked } from 'marked';
import { AgentRegistry } from '../agents/AgentRegistry';
import { EditAgent } from '../agents/EditAgent';
import { DocumentationAgent } from '../agents/DocumentationAgent';
import { AgentContext } from '../agents/BaseAgent';
import { TestAgent } from '../agents/TestAgent';

export class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;
  private _geminiService: GeminiService;
  private _fileService: FileService;
  private _diffService: DiffService;
  private _mode: 'ask' | 'agent' = 'ask';
  private _chatHistory: ChatMessage[] = [];
  private agentRegistry: AgentRegistry;

  constructor(
    context: vscode.ExtensionContext,
    geminiService: GeminiService,
    fileService: FileService,
    diffService: DiffService
  ) {
    this._context = context;
    this._geminiService = geminiService;
    this._fileService = fileService;
    this._diffService = diffService;

    // Initialize agent registry
    this.agentRegistry = AgentRegistry.getInstance();
    
    // Register built-in agents
    this.agentRegistry.registerAgent(new EditAgent());
    this.agentRegistry.registerAgent(new DocumentationAgent());
    this.agentRegistry.registerAgent(new TestAgent());
    // Register more agents here...
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui'),
        vscode.Uri.joinPath(this._context.extensionUri, 'assets')
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendMessage':
          await this._handleUserMessage(data.message);
          break;
        case 'setMode':
          this.setMode(data.mode);
          break;
        case 'clearChat':
          this._chatHistory = [];
          this._updateChatHistory();
          break;
      }
    });
  }

  public setMode(mode: 'ask' | 'agent') {
    this._mode = mode;
    this._chatHistory = []; // Clear chat history when switching modes
    this._updateChatHistory();
    
    if (this._view) {
      this._view.webview.postMessage({ type: 'setMode', mode });
      
      // Add mode-specific welcome message
      const welcomeMessage = mode === 'ask' 
        ? "Ask me anything about your code! You can reference files using @filename syntax."
        : "I'm ready to help you with file operations! Use:\n- @file to read files\n- /filename to create new files\n- #filename to edit files";
      
      this._chatHistory.push({
        role: 'assistant',
        content: welcomeMessage
      });
      this._updateChatHistory();
    }
  }

  private async _handleUserMessage(message: string) {
    try {
      // Add user message to chat history
      this._chatHistory.push({ role: 'user', content: message });
      this._updateChatHistory();

      // Show loading indicator
      if (this._view) {
        this._view.webview.postMessage({ type: 'setLoading', isLoading: true });
      }

      let response: string;

      if (this._mode === 'ask') {
        // Ask mode: Only handle file references for reading
        message = await this._processFileReferences(message);
        response = await this._geminiService.generateResponse(this._chatHistory);
      } else {
        // Find appropriate agent for the input
        const agent = this.agentRegistry.findAgentForInput(message);
        
        if (agent) {
          // Extract file path and prompt based on agent's command prefix
          const input = message.substring(agent.commandPrefix.length).trim();
          const [filePath, ...promptParts] = input.split(' ');
          const prompt = promptParts.join(' ');

          try {
            // Read the file content if needed
            const originalContent = await this._fileService.readFile(filePath);

            // Create agent context
            const context: AgentContext = {
              filePath,
              prompt,
              originalContent,
              fileService: this._fileService,
              geminiService: this._geminiService,
              diffService: this._diffService
            };

            // Execute agent
            const result = await agent.execute(context);
            response = result.message;

            if (!result.success) {
              vscode.window.showErrorMessage(result.message);
            }
          } catch (error) {
            response = `Error processing file ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
            vscode.window.showErrorMessage(response);
          }
        } else {
          response = 'No agent found to handle this command. Available commands:\n' +
            this.agentRegistry.getAllAgents()
              .map(a => `${a.commandPrefix} - ${a.description}`)
              .join('\n');
        }
      }

      // Add assistant response to chat history
      this._chatHistory.push({ role: 'assistant', content: response });
      this._updateChatHistory();

      // Hide loading indicator
      if (this._view) {
        this._view.webview.postMessage({ type: 'setLoading', isLoading: false });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      const errorMessage = `Error: ${error instanceof Error ? error.message : String(error)}`;
      
      if (this._view) {
        this._view.webview.postMessage({ type: 'setLoading', isLoading: false });
        this._view.webview.postMessage({ 
          type: 'addMessage', 
          message: { role: 'assistant', content: errorMessage }
        });
      }
    }
  }

  private async _processFileReferences(message: string): Promise<string> {
    // Only process @file references in Ask mode (for reading)
    const fileRegex = /@([^\s]+)/g;
    let match;
    let processedMessage = message;
    
    while ((match = fileRegex.exec(message)) !== null) {
      const filePath = match[1];
      try {
        const content = await this._fileService.readFile(filePath);
        processedMessage = processedMessage.replace(match[0], `@${filePath}\n\`\`\`\n${content}\n\`\`\``);
      } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
      }
    }
    
    return processedMessage;
  }

  private async _handleToolCalls(functionCalls: any[], textResponse: string): Promise<string> {
    let response = textResponse || '';
    
    for (const call of functionCalls) {
      const functionName = call.name;
      const args = call.args || {};
      
      try {
        let result;
        
        switch (functionName) {
          case 'readFile':
            result = await this._fileService.readFile(args.filePath);
            response += `\n\nRead file ${args.filePath}:\n\`\`\`\n${result}\n\`\`\``;
            break;
            
          case 'writeFile':
            await this._fileService.writeFile(args.filePath, args.content);
            response += `\n\nCreated file ${args.filePath}`;
            break;
            
          case 'editFile':
            // Show diff and ask for confirmation
            this._diffService.showDiff(args.filePath, args.originalContent, args.newContent);
            response += `\n\nProposed changes to ${args.filePath}. Please review the diff and apply or reject the changes.`;
            break;
            
          default:
            response += `\n\nUnknown function call: ${functionName}`;
        }
      } catch (error) {
        console.error(`Error executing function ${functionName}:`, error);
        response += `\n\nError executing ${functionName}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    
    return response;
  }

  private _updateChatHistory() {
    if (this._view) {
      this._view.webview.postMessage({
        type: 'updateChatHistory',
        history: this._chatHistory
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'main.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'webview-ui', 'styles.css')
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} https://cdnjs.cloudflare.com; script-src 'nonce-${nonce}'; font-src https://cdnjs.cloudflare.com;">
      <link href="${styleUri}" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css">
      <title>Momo</title>
      <style>
        .logo {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .logo i {
          font-size: 24px;
          color: var(--vscode-editor-foreground);
        }
      </style>
    </head>
    <body>
      <header>
        <div class="logo">
          <i class="fa fa-comments-o" aria-hidden="true"></i>
          <h1>Momo</h1>
        </div>
        <div class="mode-selector">
          <button id="askMode" class="mode-button active">Ask</button>
          <button id="agentMode" class="mode-button">Agent</button>
        </div>
        <button id="clearChat" class="clear-button">Clear</button>
      </header>
      
      <div id="chatContainer" class="chat-container">
        <div id="chatMessages" class="chat-messages"></div>
      </div>
      
      <div class="input-container">
        <textarea id="userInput" placeholder="Type your message..." rows="3"></textarea>
        <button id="sendButton" class="send-button">Send</button>
      </div>
      
      <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }

  /**
   * Track the last edited file
   * @param filePath Path to the file
   */
  private _trackLastEditedFile(filePath: string): void {
    this._context.workspaceState.update('lastEditedFile', filePath);
  }

  /**
   * Extract code blocks from an LLM response
   * @param llmResponse The response from the LLM
   * @returns The extracted code
   */
  private _extractCodeFromResponse(llmResponse: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let match;

    while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
      // Clean up the code block by removing marker comments
      const cleanedCode = match[1].trim()
        .replace(/\/\/ \.\.\. existing code \.\.\.\n?/g, '')
        .replace(/\/\* \.\.\. existing code \.\.\. \*\/\n?/g, '');
      codeBlocks.push(cleanedCode);
    }

    // Use the largest code block as the main edit suggestion
    if (codeBlocks.length > 0) {
      return codeBlocks.reduce(
        (longest, current) => (current.length > longest.length ? current : longest),
        ""
      );
    }

    // If no code blocks found, return the original response
    return llmResponse;
  }

  private _getLanguageValidationRules(fileExtension: string): string {
    const rules: { [key: string]: string } = {
      '.html': `For HTML files:
1. Preserve DOCTYPE declaration if present
2. Maintain proper tag nesting and closure
3. Preserve meta tags and their attributes in head section
4. Keep script and style tags intact unless explicitly modified
5. Preserve class, id, and data attributes
6. Maintain proper indentation of nested elements`,

      '.js': `For JavaScript files:
1. Preserve import/export statements
2. Maintain function and class declarations
3. Keep variable declarations and their scope
4. Preserve async/await and Promise chains
5. Keep error handling (try/catch) blocks
6. Maintain module exports
7. Preserve event listeners and callbacks`,

      '.ts': `For TypeScript files:
1. Preserve type declarations and interfaces
2. Maintain import/export statements
3. Keep type annotations and generics
4. Preserve class decorators and metadata
5. Maintain namespace declarations
6. Keep enum declarations
7. Preserve access modifiers (public, private, etc.)`,

      '.jsx': `For JSX/React files:
1. Preserve component imports and exports
2. Maintain prop types and default props
3. Keep state declarations and hooks
4. Preserve component lifecycle methods
5. Maintain event handlers
6. Keep JSX structure and nesting
7. Preserve key props and refs`,

      '.tsx': `For TSX/React files:
1. Preserve type declarations and interfaces
2. Maintain component props typing
3. Keep hooks and their type definitions
4. Preserve component exports and imports
5. Maintain generic type parameters
6. Keep event handler typings
7. Preserve context types and providers`,

      '.css': `For CSS files:
1. Preserve selector specificity
2. Maintain media queries
3. Keep vendor prefixes
4. Preserve keyframe animations
5. Maintain variable declarations
6. Keep import statements
7. Preserve comment-based section markers`,

      '.py': `For Python files:
1. Preserve import statements
2. Maintain function and class definitions
3. Keep docstrings and type hints
4. Preserve decorators
5. Maintain indentation levels
6. Keep context managers (with statements)
7. Preserve global variables and constants`,

      '.java': `For Java files:
1. Preserve package declaration
2. Maintain import statements
3. Keep class and interface declarations
4. Preserve annotations
5. Maintain access modifiers
6. Keep exception handling
7. Preserve generic type parameters`,

      '.php': `For PHP files:
1. Preserve namespace declarations
2. Maintain use statements
3. Keep class and trait declarations
4. Preserve PHP tags
5. Maintain error handling
6. Keep method visibility
7. Preserve type declarations`,

      '.go': `For Go files:
1. Preserve package declaration
2. Maintain import statements
3. Keep interface and struct definitions
4. Preserve error handling
5. Maintain goroutine calls
6. Keep defer statements
7. Preserve type declarations`,

      '.rs': `For Rust files:
1. Preserve use statements
2. Maintain mod declarations
3. Keep trait implementations
4. Preserve macro invocations
5. Maintain type definitions
6. Keep lifetime annotations
7. Preserve error handling`
    };

    // Get the rules for the file extension, or return generic rules if not found
    return rules[fileExtension] || `Generic rules:
1. Preserve all import/include statements
2. Maintain function and class declarations
3. Keep variable declarations and scope
4. Preserve language-specific keywords and operators
5. Maintain proper indentation and formatting
6. Keep comments and documentation
7. Preserve error handling structures`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
} 