import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import { GeminiService } from '../services/GeminiService';
import { FileService } from '../services/FileService';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';

export class DocumentationAgent implements BaseAgent {
  id = 'doc-agent';
  name = 'Documentation Agent';
  description = 'Generates documentation for files and folders';
  commandPrefix = '@doc';

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { filePath, prompt, fileService, geminiService } = context;
      
      if (!filePath) {
        return {
          success: false,
          message: 'Please specify a file or folder path'
        };
      }

      // Remove @doc prefix from filePath
      const targetPath = filePath.startsWith('@doc') ? filePath.substring(4).trim() : filePath;
      
      // Create documentation output path
      const docOutputPath = this.getDocumentationFilePath(targetPath);

      let documentation: string;

      try {
        const content = await fileService.readFile(targetPath);
        // Generate documentation
        documentation = await this.generateDocumentation(targetPath, content, prompt || '', geminiService);
        
        // Write documentation to txt file
        await fileService.writeFile(docOutputPath, documentation);

        return {
          success: true,
          message: `Documentation created at: ${docOutputPath}`,
          content: documentation
        };
      } catch (error) {
        return {
          success: false,
          message: `Error processing file ${targetPath}: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error in DocumentationAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private getDocumentationFilePath(sourceFilePath: string): string {
    const dir = path.dirname(sourceFilePath);
    const basename = path.basename(sourceFilePath, path.extname(sourceFilePath));
    return path.join(dir, `${basename}_documentation.txt`);
  }

  private async generateDocumentation(
    filePath: string,
    content: string,
    prompt: string,
    geminiService: GeminiService
  ): Promise<string> {
    const fileType = path.extname(filePath);
    const context = `
Analyze and document the following ${fileType} file:
${path.basename(filePath)}

CODE:
\`\`\`${fileType}
${content}
\`\`\`

Generate detailed documentation including:

FILE OVERVIEW
-------------
- Purpose and main functionality
- Key features and responsibilities

COMPONENTS BREAKDOWN
------------------
- List of functions/methods
- Classes and interfaces
- Important variables and constants

DEPENDENCIES
-----------
- External dependencies
- Internal module dependencies

USAGE EXAMPLES
-------------
- Basic usage examples
- Common patterns

TECHNICAL DETAILS
---------------
- Important implementation details
- Architecture decisions
- Performance considerations

Additional requirements: ${prompt}

Format the response as a plain text document with clear sections and proper spacing.`;

    const response = await geminiService.generateResponse([
      { role: 'user', content: context }
    ]);

    const timestamp = new Date().toISOString();
    return `DOCUMENTATION GENERATED ON: ${timestamp}
========================================

${response}`;
  }

  private createChangeLogEntry(
    timestamp: string,
    targetPath: string,
    action: string,
    prompt: string
  ): string {
    return `
=================================================================
Date: ${timestamp}
Target: ${targetPath}
Action: ${action}
Request: ${prompt || 'No specific requirements'}
=================================================================
`;
  }

  private getChangeLogPath(filePath: string): string {
    const dir = path.dirname(filePath);
    return path.join(dir, 'documentation_changes.txt');
  }

  private async updateChangeLog(
    changeLogPath: string,
    newEntry: string,
    fileService: FileService
  ): Promise<void> {
    let existingContent = '';
    try {
      existingContent = await fileService.readFile(changeLogPath);
    } catch (error) {
      // File doesn't exist yet, start with empty content
    }

    const updatedContent = newEntry + existingContent;
    await fileService.writeFile(changeLogPath, updatedContent);
  }

  private async generateFileDocumentation(
    filePath: string,
    content: string,
    prompt: string,
    geminiService: GeminiService
  ): Promise<string> {
    const fileType = path.extname(filePath);
    const context = `
Generate comprehensive documentation for this ${fileType} file.
File: ${path.basename(filePath)}

Content:
\`\`\`${fileType}
${content}
\`\`\`

Additional requirements: ${prompt}

Please provide markdown documentation that includes:
1. Overview of the file's purpose
2. Main components/functions and their purposes
3. Important types/interfaces/classes
4. Usage examples where applicable
5. Dependencies and requirements
6. Any important notes or caveats

Format the response as a proper markdown document.`;

    const response = await geminiService.generateResponse([
      { role: 'user', content: context }
    ]);

    return response;
  }

  private async generateFolderDocumentation(
    folderPath: string,
    fileService: FileService,
    geminiService: GeminiService
  ): Promise<string> {
    // Get folder structure
    const structure = await this.getFolderStructure(folderPath);
    
    // Get brief summaries of important files
    const fileOverviews = await this.getFileOverviews(folderPath, fileService, geminiService);

    const context = `
Generate comprehensive documentation for this project folder.
Folder: ${path.basename(folderPath)}

Folder structure:
\`\`\`
${structure}
\`\`\`

File overviews:
${fileOverviews}

Please provide a markdown document that includes:
1. Project overview
2. Folder structure explanation
3. Main components and their purposes
4. Setup and installation instructions
5. Usage examples
6. Dependencies
7. Contributing guidelines
8. License information (if available)

Format the response as a proper markdown document.`;

    const response = await geminiService.generateResponse([
      { role: 'user', content: context }
    ]);

    return response;
  }

  private async getFolderStructure(folderPath: string, indent = ''): Promise<string> {
    let result = '';
    const items = await fs.readdir(folderPath);

    for (const item of items) {
      if (this.shouldIgnore(item)) continue;

      const fullPath = path.join(folderPath, item);
      const stats = await fs.stat(fullPath);

      if (stats.isDirectory()) {
        result += `${indent}${item}/\n`;
        result += await this.getFolderStructure(fullPath, indent + '  ');
      } else {
        result += `${indent}${item}\n`;
      }
    }

    return result;
  }

  private async getFileOverviews(
    folderPath: string,
    fileService: FileService,
    geminiService: GeminiService
  ): Promise<string> {
    const importantFiles = await this.findImportantFiles(folderPath);
    let overviews = '';

    for (const file of importantFiles) {
      try {
        const content = await fileService.readFile(file);
        const overview = await geminiService.generateResponse([{
          role: 'user',
          content: `Provide a 2-3 sentence overview of this file's purpose:\n\`\`\`\n${content}\n\`\`\``
        }]);
        overviews += `\n${path.relative(folderPath, file)}:\n${overview}\n`;
      } catch (error) {
        console.error(`Error processing ${file}:`, error);
      }
    }

    return overviews;
  }

  private async findImportantFiles(folderPath: string): Promise<string[]> {
    const important: string[] = [];
    const self = this; // Store reference to this
    
    async function scan(dir: string) {
      const items = await fs.readdir(dir);
      
      for (const item of items) {
        if (item.startsWith('.')) continue;
        
        const fullPath = path.join(dir, item);
        const stats = await fs.stat(fullPath);
        
        if (stats.isDirectory()) {
          await scan(fullPath);
        } else if (self.isImportantFile(item)) { // Use self instead of this
          important.push(fullPath);
        }
      }
    }

    await scan(folderPath);
    return important;
  }

  private isImportantFile(filename: string): boolean {
    const important = [
      'README.md',
      'package.json',
      'tsconfig.json',
      'index.ts',
      'index.js',
      'main.ts',
      'main.js',
      'app.ts',
      'app.js'
    ];
    
    return Boolean(
      important.includes(filename) ||
      filename.endsWith('.d.ts') ||
      filename.match(/^index\.[jt]sx?$/)
    );
  }

  private shouldIgnore(item: string): boolean {
    const ignoreList = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.DS_Store',
      'coverage'
    ];
    return ignoreList.includes(item) || item.startsWith('.');
  }

  private getDocumentationPath(filePath: string): string {
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath, path.extname(filePath));
    return path.join(dir, `${basename}.md`);
  }
}