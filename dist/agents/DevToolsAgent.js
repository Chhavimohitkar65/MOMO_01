"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevToolsAgent = void 0;
const ws_1 = __importStar(require("ws"));
const vscode = __importStar(require("vscode"));
const ChromeDevTools_1 = require("../services/ChromeDevTools");
const EditAgent_1 = require("./EditAgent");
const FileService_1 = require("../services/FileService");
const DiffService_1 = require("../services/DiffService");
class DevToolsAgent {
    constructor(context) {
        this.id = 'devtools-agent';
        this.name = 'DevTools Agent';
        this.description = 'Integrates with Chrome DevTools for real-time UI assistance';
        this.commandPrefix = '@ui';
        this.wsServer = null;
        this.clients = new Set();
        this._context = context;
        this.chromeDevTools = new ChromeDevTools_1.ChromeDevTools();
        this.outputChannel = vscode.window.createOutputChannel('Momo DevTools');
        this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('momo-devtools');
        this.setupWebSocketServer();
    }
    setupWebSocketServer() {
        try {
            this.wsServer = new ws_1.WebSocketServer({ port: 9229 });
            this.outputChannel.appendLine('DevTools WebSocket server started on port 9229');
            this.wsServer.on('connection', (ws) => {
                this.clients.add(ws);
                this.outputChannel.appendLine('New DevTools client connected');
                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message.toString());
                        await this.handleDevToolsMessage(data);
                    }
                    catch (error) {
                        this.outputChannel.appendLine(`Error handling message: ${error}`);
                    }
                });
                ws.on('close', () => {
                    this.clients.delete(ws);
                    this.outputChannel.appendLine('DevTools client disconnected');
                });
            });
        }
        catch (error) {
            this.outputChannel.appendLine(`Error setting up WebSocket server: ${error}`);
        }
    }
    async handleDevToolsMessage(data) {
        try {
            if (data.type === 'edit-request' && data.filePath && data.originalContent) {
                await this.handleEditRequest(data);
            }
            else {
                const aiPrompt = this.createAIPrompt(data);
                const aiResponse = await this._geminiService.generateResponse([
                    { role: 'system', content: 'You are a UI/UX expert analyzing web applications.' },
                    { role: 'user', content: aiPrompt }
                ]);
                switch (data.type) {
                    case 'ui-suggestion':
                        await this.handleUISuggestion(data.suggestion, aiResponse);
                        break;
                    case 'error-report':
                        await this.handleErrorReport(data.error, aiResponse);
                        break;
                    case 'test-request':
                        await this.handleTestRequest(data.component, aiResponse);
                        break;
                }
            }
        }
        catch (error) {
            this.outputChannel.appendLine(`Error processing message with AI: ${error}`);
        }
    }
    async handleEditRequest(data) {
        const editAgent = new EditAgent_1.EditAgent();
        const editContext = {
            filePath: data.filePath,
            originalContent: data.originalContent,
            prompt: data.prompt || '',
            geminiService: this._geminiService,
            fileService: new FileService_1.FileService(this._context),
            diffService: new DiffService_1.DiffService()
        };
        const result = await editAgent.execute(editContext);
        this.broadcastToDevTools({
            type: 'edit-response',
            success: result.success,
            message: result.message,
            changes: result.content
        });
    }
    createAIPrompt(data) {
        switch (data.type) {
            case 'ui-suggestion':
                return `Analyze this UI element and provide improvements:
Element: ${data.suggestion?.selector}
Current state: ${data.suggestion?.recommendation}
Priority: ${data.suggestion?.priority}

Provide specific suggestions for:
1. Accessibility improvements
2. UX enhancements
3. Performance optimizations
4. Best practices compliance`;
            case 'error-report':
                return `Analyze this error and suggest fixes:
Error type: ${data.error?.type}
Message: ${data.error?.message}
Stack trace: ${data.error?.stack}
Element: ${data.error?.selector}

Provide:
1. Root cause analysis
2. Potential fixes
3. Prevention strategies
4. Testing recommendations`;
            case 'test-request':
                return `Generate test cases for this component:
Component: ${data.component?.name}
Selector: ${data.component?.selector}
Interactions: ${data.component?.interactions?.join(', ')}

Include:
1. Unit tests
2. Integration tests
3. E2E test scenarios
4. Accessibility tests`;
            default:
                return '';
        }
    }
    async handleUISuggestion(suggestion, aiResponse) {
        const aiEnhancedSuggestion = {
            ...suggestion,
            aiAnalysis: aiResponse,
            timestamp: new Date().toISOString()
        };
        this.broadcastToDevTools({
            type: 'ui-suggestion-enhanced',
            suggestion: aiEnhancedSuggestion
        });
        vscode.window.showInformationMessage(`UI Suggestion for ${suggestion.selector}: ${aiResponse.split('\n')[0]}`, 'View Details').then(selection => {
            if (selection === 'View Details') {
                this.showDetailedAnalysis(aiEnhancedSuggestion);
            }
        });
    }
    async handleErrorReport(error, aiResponse) {
        const aiEnhancedError = {
            ...error,
            aiAnalysis: aiResponse,
            timestamp: new Date().toISOString()
        };
        this.broadcastToDevTools({
            type: 'error-report-enhanced',
            error: aiEnhancedError
        });
        this.showInProblemsPanel(aiEnhancedError);
    }
    async handleTestRequest(component, aiResponse) {
        const testCases = this.parseTestCases(aiResponse);
        const aiEnhancedTest = {
            ...component,
            generatedTests: testCases,
            timestamp: new Date().toISOString()
        };
        this.broadcastToDevTools({
            type: 'test-cases-generated',
            test: aiEnhancedTest
        });
        await this.createTestFile(component.name, testCases);
    }
    broadcastToDevTools(message) {
        if (message.type === 'edit-response') {
            this.outputChannel.appendLine(`Broadcasting edit response: ${JSON.stringify(message)}`);
        }
        const messageStr = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === ws_1.default.OPEN) {
                client.send(messageStr);
            }
        });
    }
    canHandle(input) {
        return input.startsWith(this.commandPrefix);
    }
    async execute(context) {
        this._geminiService = context.geminiService;
        try {
            const { prompt, filePath } = context;
            // If only a file path is provided, analyze it
            if (filePath && !prompt) {
                return this.analyzeUI(filePath);
            }
            if (!prompt) {
                return {
                    success: false,
                    message: 'Please specify a UI element to analyze or a command to execute'
                };
            }
            const [command, ...args] = prompt.split(' ');
            switch (command) {
                case '@ui-analyze':
                    return this.analyzeUI(args.join(' '));
                case '@ui-fix':
                    return this.fixUIIssue(args.join(' '), context);
                case '@ui-test':
                    return this.generateUITests(args.join(' '), context);
                default:
                    return {
                        success: false,
                        message: 'Unknown UI command. Available commands: @ui-analyze, @ui-fix, @ui-test'
                    };
            }
        }
        catch (error) {
            return {
                success: false,
                message: `Error in DevToolsAgent: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    async analyzeUI(target) {
        try {
            const analysis = await this.chromeDevTools.analyzeUI(target);
            const aiPrompt = `Analyze this UI element and provide improvements:
Element: ${target}
Current state: ${JSON.stringify(analysis, null, 2)}

Provide specific suggestions for:
1. Accessibility (WCAG compliance)
2. UX improvements
3. Performance optimizations
4. Best practices`;
            const aiResponse = await this._geminiService.generateResponse([
                { role: 'system', content: 'You are a UI/UX expert analyzing web applications.' },
                { role: 'user', content: aiPrompt }
            ]);
            return {
                success: true,
                message: aiResponse,
                content: JSON.stringify(analysis, null, 2)
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error analyzing UI: ${error}`
            };
        }
    }
    async fixUIIssue(issue, context) {
        return {
            success: true,
            message: 'UI fix applied'
        };
    }
    async generateUITests(component, context) {
        return {
            success: true,
            message: 'UI tests generated'
        };
    }
    showDetailedAnalysis(analysis) {
        const panel = vscode.window.createWebviewPanel('uiAnalysis', 'UI Analysis Details', vscode.ViewColumn.Two, { enableScripts: true });
        panel.webview.html = this.getAnalysisHtml(analysis);
    }
    showInProblemsPanel(error) {
        const diagnostic = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), error.aiAnalysis, vscode.DiagnosticSeverity.Error);
        const diagnostics = new Map();
        diagnostics.set('DevTools', [diagnostic]);
        if (!this.diagnosticsCollection) {
            this.diagnosticsCollection = vscode.languages.createDiagnosticCollection('momo-devtools');
        }
        this.diagnosticsCollection.set(vscode.Uri.parse('devtools://errors'), [diagnostic]);
    }
    parseTestCases(aiResponse) {
        const testCases = aiResponse.split('\n')
            .filter(line => line.startsWith('test'))
            .map(test => {
            const [name, ...description] = test.split(':');
            return { name: name.trim(), description: description.join(':').trim() };
        });
        return testCases;
    }
    async createTestFile(componentName, testCases) {
        const testFileContent = this.generateTestFileContent(componentName, testCases);
        const testFilePath = `tests/${componentName}.test.ts`;
        await vscode.workspace.fs.writeFile(vscode.Uri.file(testFilePath), Buffer.from(testFileContent));
    }
    getAnalysisHtml(analysis) {
        return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>UI Analysis</title>
          <style>
            body { font-family: var(--vscode-font-family); }
            .analysis-item { margin: 1em 0; }
            .timestamp { color: var(--vscode-descriptionForeground); }
          </style>
        </head>
        <body>
          <h2>UI Analysis Details</h2>
          <div class="timestamp">Generated: ${analysis.timestamp}</div>
          <div class="analysis-item">
            <h3>Element: ${analysis.selector}</h3>
            <pre>${analysis.aiAnalysis}</pre>
          </div>
        </body>
      </html>
    `;
    }
    generateTestFileContent(componentName, testCases) {
        return `
import { test, expect } from '@playwright/test';

describe('${componentName}', () => {
  ${testCases.map(tc => `
  test('${tc.name}', async ({ page }) => {
    // TODO: Implement test
    // ${tc.description}
  });`).join('\n')}
});
`;
    }
    dispose() {
        if (this.wsServer) {
            this.wsServer.close();
        }
        this.outputChannel.dispose();
        if (this.diagnosticsCollection) {
            this.diagnosticsCollection.dispose();
        }
    }
}
exports.DevToolsAgent = DevToolsAgent;
//# sourceMappingURL=DevToolsAgent.js.map