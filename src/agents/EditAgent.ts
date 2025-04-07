import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import * as path from 'path';
import * as vscode from 'vscode';
import * as diff from 'diff';

interface EditOperation {
  type: 'insert' | 'replace' | 'delete';
  range: vscode.Range;
  text?: string;
}

interface EditTarget {
  type: 'function' | 'class' | 'method' | 'section' | 'line' | 'general';
  identifier?: string;
  lineRange?: { start: number; end: number };
  description: string;
}

export class EditAgent implements BaseAgent {
  id = 'edit-agent';
  name = 'Edit Agent';
  description = 'Intelligently edits files using LLM';
  commandPrefix = '#';

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { filePath, prompt, geminiService, diffService } = context;
      
      if (!filePath) {
        return {
          success: false,
          message: 'Missing file path'
        };
      }

      // Remove # prefix if present
      const cleanFilePath = filePath.startsWith('#') ? filePath.substring(1) : filePath;

      // Get workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        return {
          success: false,
          message: 'No workspace folder is open'
        };
      }

      // Get the full file URI
      const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, cleanFilePath);

      // Try to open the document
      let document: vscode.TextDocument;
      try {
        document = await vscode.workspace.openTextDocument(fileUri);
      } catch (error) {
        return {
          success: false,
          message: `Cannot open file ${cleanFilePath}: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      const originalContent = document.getText();

      // Generate edit context
      const editContext = this.createEditContext(cleanFilePath, originalContent, prompt || '');
      
      // Get LLM response
      const llmResponse = await geminiService.generateResponse([
        { role: 'user', content: editContext }
      ]);

      // Extract code blocks
      const codeBlocks = this.extractCodeBlocks(llmResponse);
      if (codeBlocks.length === 0) {
        return {
          success: false,
          message: "No code blocks found in the LLM response."
        };
      }

      // Get the largest code block as the main edit suggestion
      const newContent = codeBlocks.reduce(
        (longest, current) => (current.length > longest.length ? current : longest),
        ""
      );

      // Show diff and store pending changes
      diffService.showDiff(cleanFilePath, originalContent, newContent);

      // Try to apply the edit
      const editor = await vscode.window.showTextDocument(document);
      await editor.edit(editBuilder => {
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        editBuilder.replace(fullRange, newContent);
      });

      return {
        success: true,
        message: `Changes proposed for ${cleanFilePath}. Please review the diff and apply or reject the changes.`,
        content: newContent
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in EditAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private extractCodeBlocks(llmResponse: string): string[] {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/g;
    const codeBlocks: string[] = [];
    let match;

    while ((match = codeBlockRegex.exec(llmResponse)) !== null) {
      // Clean up the code block by removing marker comments
      const cleanedCode = match[1].trim()
        .replace(/\/\/ \.\.\. existing code \.\.\.\n?/g, '')
        .replace(/\/\* \.\.\. existing code \.\.\. \*\/\n?/g, '')
        .replace(/<!-- \.\.\. existing code \.\.\. -->\n?/g, '');
      
      codeBlocks.push(cleanedCode);
    }

    return codeBlocks;
  }

  private resolveFilePath(filePath: string): vscode.Uri {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(filePath)) {
      return vscode.Uri.file(filePath);
    }
    
    // Otherwise, resolve relative to workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder is open');
    }
    
    return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
  }

  private createEditContext(filePath: string, originalContent: string, prompt: string): string {
    const fileExtension = path.extname(filePath).toLowerCase();
    const editTarget = this.parseEditTarget(prompt, originalContent);
    
    let targetInstructions = '';
    if (editTarget.type !== 'general') {
      targetInstructions = `\nTarget: ${editTarget.description}
Specific instructions:
- Focus changes only on the specified ${editTarget.type}
- Preserve all code outside the target area
- Use markers to clearly indicate the boundaries of your changes
- If the target doesn't exist, add it in an appropriate location\n`;
    }
    
    // Include file extension in LLM context but not in preview
    return `
File to edit: ${filePath}
File extension: ${fileExtension}
Current content:
\`\`\`
${originalContent}
\`\`\`

Edit request: ${prompt}${targetInstructions}

Instructions for editing:
1. Preserve code structure:
   - Keep all imports, declarations, and dependencies
   - Maintain proper indentation and formatting
   - Preserve critical language constructs

2. Editing guidelines:
   - Make changes only to the specified target area
   - Keep the overall file structure intact
   - Match the style and indentation of the original code
   - Add clear comments explaining significant changes
   - Return response without file extension in code blocks

Please provide the complete file content with your edits.`;
  }

  private sanitizeCodeBlock(codeBlock: string, fileExtension: string): string {
    // Remove any language identifier from code blocks
    return codeBlock.replace(new RegExp(`\`\`\`${fileExtension}\\n`), '```\n');
  }

  private parseEditTarget(prompt: string, originalContent: string): EditTarget {
    // Check for line number references (e.g., "line 5", "lines 10-20")
    const lineRangeMatch = prompt.match(/lines? (\d+)(?:-(\d+))?/i);
    if (lineRangeMatch) {
      const start = parseInt(lineRangeMatch[1]);
      const end = lineRangeMatch[2] ? parseInt(lineRangeMatch[2]) : start;
      return {
        type: 'line',
        lineRange: { start, end },
        description: `Lines ${start}${end !== start ? `-${end}` : ''}`
      };
    }

    // Check for function references
    const functionMatch = prompt.match(/function\s+(\w+)/i) || prompt.match(/the\s+(\w+)\s+function/i);
    if (functionMatch) {
      return {
        type: 'function',
        identifier: functionMatch[1],
        description: `Function ${functionMatch[1]}`
      };
    }

    // Check for method references
    const methodMatch = prompt.match(/method\s+(\w+)/i) || prompt.match(/the\s+(\w+)\s+method/i);
    if (methodMatch) {
      return {
        type: 'method',
        identifier: methodMatch[1],
        description: `Method ${methodMatch[1]}`
      }; 
    }

    // Check for class references
    const classMatch = prompt.match(/class\s+(\w+)/i) || prompt.match(/the\s+(\w+)\s+class/i);
    if (classMatch) {
      return {
        type: 'class',
        identifier: classMatch[1],
        description: `Class ${classMatch[1]}`
      };
    }

    // Check for section references (e.g., "imports section", "constructor section")
    const sectionMatch = prompt.match(/(\w+)\s+section/i);
    if (sectionMatch) {
      return {
        type: 'section',
        identifier: sectionMatch[1].toLowerCase(),
        description: `${sectionMatch[1]} section`
      };
    }

    // Default to general edit
    return {
      type: 'general',
      description: 'General edit'
    };
  }

  private async getOrCreateDocument(filePath: string): Promise<vscode.TextDocument> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error('No workspace folder is open');
    }

    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filePath);
    
    try {
      return await vscode.workspace.openTextDocument(fileUri);
    } catch (error) {
      // File doesn't exist, create it
      await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());
      return await vscode.workspace.openTextDocument(fileUri);
    }
  }
}