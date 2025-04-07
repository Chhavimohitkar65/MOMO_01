import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import { GeminiService } from '../services/GeminiService';
import * as vscode from 'vscode';
import * as path from 'path';

export class RunAgent implements BaseAgent {
  id = 'run-agent';
  name = 'Run Agent';
  description = 'Executes files using appropriate runners';
  commandPrefix = '@run';
  private terminal: vscode.Terminal | null = null;

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { filePath, originalContent, geminiService } = context;
      
      if (!filePath || !originalContent) {
        return {
          success: false,
          message: 'Missing file information'
        };
      }

      // Analyze file using LLM
      const analysis = await this.analyzeFile(filePath, originalContent, geminiService);
      const result = await this.runFile(filePath, analysis);
      
      return {
        success: true,
        message: result
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in RunAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private async analyzeFile(
    filePath: string, 
    content: string, 
    geminiService: GeminiService
  ): Promise<{ 
    type: string;
    framework?: string;
    command: string;
    setupCommands?: string[];
    isWebApp: boolean;
    port?: number;
  }> {
    const prompt = `You are a code execution analyzer. Analyze the given file and provide ONLY a JSON response without any additional text or markdown formatting.

File: ${filePath}
Content:
\`\`\`
${content}
\`\`\`

Required JSON format:
{
  "type": "string (e.g., python, javascript, etc.)",
  "framework": "string (optional, e.g., flask, react, etc.)",
  "command": "string (the command to run the file)",
  "setupCommands": ["array of setup commands if needed"],
  "isWebApp": boolean,
  "port": number (optional, required if isWebApp is true)
}

Rules:
1. Response must be valid JSON
2. Use proper file paths with quotes
3. Include all necessary setup commands
4. For web apps, always specify port
5. Use appropriate commands based on file type
6. Escape special characters in commands`;

    let response: string;
    try {
      response = await geminiService.generateResponse([
        { role: 'user', content: prompt }
      ]);

      // Clean the response to ensure it's valid JSON
      const cleanedResponse = this.cleanJsonResponse(response);

      // Parse and validate the response
      const analysisResult = JSON.parse(cleanedResponse);
      
      // Validate required fields
      if (!analysisResult.type || !analysisResult.command) {
        throw new Error('Invalid analysis: missing required fields');
      }

      // Ensure setupCommands is always an array
      if (!analysisResult.setupCommands) {
        analysisResult.setupCommands = [];
      }

      return analysisResult;
    } catch (error) {
      console.error('LLM response parsing error:', error);
      console.error('Raw response:', response!);
      
      // Fallback to basic file type detection
      return this.getFallbackAnalysis(filePath);
    }
  }

  private cleanJsonResponse(response: string): string {
    // Remove any markdown code block syntax
    let cleaned = response.replace(/```json\s*|\s*```/g, '');
    
    // Find the first '{' and last '}'
    const startIndex = cleaned.indexOf('{');
    const endIndex = cleaned.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error('No valid JSON object found in response');
    }
    
    // Extract just the JSON part
    cleaned = cleaned.slice(startIndex, endIndex + 1);
    
    return cleaned;
  }

  private getFallbackAnalysis(filePath: string): {
    type: string;
    command: string;
    setupCommands: string[];
    isWebApp: boolean;
  } {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    // Basic fallback configurations
    const fallbacks: { [key: string]: any } = {
      '.py': {
        type: 'python',
        command: `python "${fileName}"`,
        isWebApp: false
      },
      '.js': {
        type: 'javascript',
        command: `node "${fileName}"`,
        isWebApp: false
      },
      // Add more fallbacks for other file types
    };

    return {
      type: fallbacks[ext]?.type || 'unknown',
      command: fallbacks[ext]?.command || `echo "No default command for ${ext}"`,
      setupCommands: [],
      isWebApp: false
    };
  }

  private async runFile(
    filePath: string, 
    analysis: { 
      type: string; 
      command: string; 
      setupCommands?: string[];
      isWebApp: boolean;
      port?: number;
    }
  ): Promise<string> {
    // Create dedicated terminal
    const fileName = path.basename(filePath);
    this.terminal = vscode.window.createTerminal(`Run ${fileName}`);
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return 'Error: No workspace folder found';
    }

    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(workspaceFolder.uri.fsPath, filePath);

    this.terminal.show(true);

    // Run setup commands if any
    if (analysis.setupCommands?.length) {
      for (const cmd of analysis.setupCommands) {
        this.terminal.sendText(cmd);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Replace file placeholder in command
    const command = analysis.command.replace(/\${file}/g, fullPath);
    this.terminal.sendText(command);

    // Handle web applications
    if (analysis.isWebApp && analysis.port) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const url = `http://localhost:${analysis.port}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
      return `Starting ${analysis.type} application at ${url}`;
    }

    return `Running ${fileName} (${analysis.type}) with command: ${command}`;
  }

  async validate(context: AgentContext): Promise<boolean> {
    if (!context.filePath) {
      return false;
    }

    const ext = path.extname(context.filePath).toLowerCase();
    const supportedExtensions = [
      '.js', '.ts', '.py', '.rb', '.go', '.java', '.php',
      '.rs', '.cpp', '.cc', '.c', '.sh', '.ps1', '.R', '.jl'
    ];
    
    return supportedExtensions.includes(ext);
  }
}
