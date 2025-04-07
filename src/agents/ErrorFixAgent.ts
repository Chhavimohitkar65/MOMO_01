import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import * as vscode from 'vscode';
import * as path from 'path';

interface TerminalData {
  line: string;
  timestamp: number;
}

// Add interface for terminal output
interface TerminalOutputEvent {
  data: string;
  terminal: vscode.Terminal;
}

export class ErrorFixAgent implements BaseAgent {
  id = 'error-fix-agent';
  name = 'Error Fix Agent';
  description = 'Automatically detects and fixes errors in your code';
  commandPrefix = '@fix';
  
  private terminal: vscode.Terminal | null = null;
  private errorBuffer: string[] = [];
  private isProcessingError = false;
  private static INSTANCE: ErrorFixAgent;
  private lastActiveTerminal: vscode.Terminal | null = null;
  private monitoredTerminals: Set<string> = new Set();
  private errorMonitorTerminal: vscode.Terminal | null = null;

  constructor() {
    // Singleton instance for terminal tracking
    if (ErrorFixAgent.INSTANCE) {
      return ErrorFixAgent.INSTANCE;
    }
    ErrorFixAgent.INSTANCE = this;

    // Listen to terminal creation and closure
    vscode.window.onDidOpenTerminal(terminal => {
      this.setupTerminalListener(terminal);
    });

    // Track existing terminals
    vscode.window.terminals.forEach(terminal => {
      this.setupTerminalListener(terminal);
    });

    // Listen to diagnostics changes
    vscode.languages.onDidChangeDiagnostics(event => {
      this.handleDiagnosticsChange(event);
    });

    // Add terminal cleanup listener
    vscode.window.onDidCloseTerminal(terminal => {
      this.monitoredTerminals.delete(terminal.name);
      if (terminal === this.errorMonitorTerminal) {
        this.errorMonitorTerminal = null;
      }
    });
  }

  private setupTerminalListener(terminal: vscode.Terminal) {
    // Skip if already monitoring this terminal
    if (this.monitoredTerminals.has(terminal.name) || terminal.name === 'Error Monitor') {
      return;
    }
    
    this.monitoredTerminals.add(terminal.name);
    
    // Track active terminal
    vscode.window.onDidChangeActiveTerminal(activeTerminal => {
      if (activeTerminal) {
        this.lastActiveTerminal = activeTerminal;
      }
    });

    // Only attach listener, don't create new terminals here
    terminal.processId.then(processId => {
      if (processId) {
        this.attachTerminalListener(terminal);
      }
    });
  }

  private attachTerminalListener(terminal: vscode.Terminal) {
    // Don't create new terminals here, just set up the listener
    const pty = {
      onDidWrite: new vscode.EventEmitter<string>().event,
      open: () => {},
      close: () => {},
      handleInput: (data: string) => {
        // Check for fix command
        if (data.toLowerCase().includes('fix') && data.toLowerCase().includes('bug')) {
          this.handleFixCommand(terminal);
        }
      }
    } as vscode.Pseudoterminal;

    // Only create the error monitor terminal once if it doesn't exist
    if (!this.errorMonitorTerminal) {
      this.errorMonitorTerminal = vscode.window.createTerminal({
        name: 'Error Monitor',
        pty
      });
    }
  }

  private async handleFixCommand(terminal: vscode.Terminal) {
    if (!this.lastActiveTerminal) {
      return;
    }

    // Get the active editor
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      terminal.sendText('No active file to fix.');
      return;
    }

    // Get diagnostics for current file
    const uri = editor.document.uri;
    const diagnostics = vscode.languages.getDiagnostics(uri);
    const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);

    if (errors.length === 0) {
      terminal.sendText('No errors found in the current file.');
      return;
    }

    // Process errors
    const errorMessages = errors.map(error => ({
      message: error.message,
      range: error.range,
      code: error.code
    }));

    await this.processError(JSON.stringify(errorMessages), uri);
  }

  private async handleTerminalOutput(event: TerminalOutputEvent): Promise<void> {
    if (this.terminal && event.terminal === this.terminal) {
      await this.handleTerminalData(event.terminal, event.data);
    }
  }

  private async handleTerminalData(terminal: vscode.Terminal, data: string) {
    if (!terminal) {
      return;
    }

    // Check for error patterns
    if (this.isErrorMessage(data) && !this.isProcessingError) {
      this.errorBuffer.push(data);
      
      // Wait for the complete error message
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (this.errorBuffer.length > 0) {
        await this.processError(this.errorBuffer.join('\n'));
        this.errorBuffer = [];
      }
    }
  }

  private async handleDiagnosticsChange(event: vscode.DiagnosticChangeEvent) {
    if (this.isProcessingError) {
      return;
    }

    for (const uri of event.uris) {
      const diagnostics = vscode.languages.getDiagnostics(uri);
      const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
      
      if (errors.length > 0) {
        const errorMessages = errors.map(error => ({
          message: error.message,
          range: error.range,
          code: error.code
        }));
        
        await this.processError(JSON.stringify(errorMessages), uri);
      }
    }
  }

  private isErrorMessage(data: string): boolean {
    const errorPatterns = [
      /error/i,
      /exception/i,
      /traceback/i,
      /failed/i,
      /syntax error/i
    ];
    return errorPatterns.some(pattern => pattern.test(data));
  }

  private async processError(errorMessage: string, uri?: vscode.Uri) {
    this.isProcessingError = true;
    try {
      const context: AgentContext = {
        filePath: uri?.fsPath,
        originalContent: uri ? await this.getFileContent(uri) : undefined,
        prompt: `Fix this error:\n${errorMessage}`,
        geminiService: undefined as any, // Will be provided by the agent system
        fileService: undefined as any,   // Will be provided by the agent system
        diffService: undefined as any    // Will be provided by the agent system
      };

      await this.execute(context);
    } finally {
      this.isProcessingError = false;
    }
  }

  private async getFileContent(uri: vscode.Uri): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);
    return document.getText();
  }

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { filePath, originalContent, prompt, geminiService } = context;
      
      if (!filePath || !originalContent) {
        return {
          success: false,
          message: 'Missing file information'
        };
      }

      // Generate fix using LLM
      const fixPrompt = `
Fix the following error in this code:

File: ${filePath}
Error: ${prompt}

Original code:
\`\`\`
${originalContent}
\`\`\`

Provide only the fixed code without any explanations.
If multiple fixes are possible, provide the most likely fix.
Preserve the original code structure and style.
`;

      const response = await geminiService.generateResponse([
        { role: 'user', content: fixPrompt }
      ]);

      // Extract code from response
      const fixedCode = this.extractCode(response);

      // Show diff and apply changes
      if (fixedCode && fixedCode !== originalContent) {
        context.diffService.showDiff(filePath, originalContent, fixedCode);
        return {
          success: true,
          message: 'Fix generated. Please review the changes in the diff view.',
          content: fixedCode
        };
      }

      return {
        success: false,
        message: 'No fixes needed or could not generate a fix.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in ErrorFixAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private extractCode(response: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/g;
    const matches = Array.from(response.matchAll(codeBlockRegex));
    
    if (matches.length > 0) {
      return matches.reduce((longest, current) => 
        current[1].length > longest.length ? current[1] : longest
      , '').trim();
    }
    
    return response.trim();
  }

  async validate(context: AgentContext): Promise<boolean> {
    return Boolean(context.filePath && context.originalContent);
  }
}
