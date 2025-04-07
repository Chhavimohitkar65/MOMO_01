import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import * as vscode from 'vscode';
import * as path from 'path';

export class TestAgent implements BaseAgent {
  id = 'test-agent';
  name = 'Test Agent';
  description = 'Generates and updates test files for your code';
  commandPrefix = '@test';
  private terminal: vscode.Terminal | null = null;

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { filePath, originalContent, geminiService, fileService } = context;
      
      if (!filePath || !originalContent) {
        return {
          success: false,
          message: 'Missing required file information'
        };
      }

      // Determine test file path
      const testFilePath = this.getTestFilePath(filePath);
      
      // Check if test file exists
      let existingTests = '';
      try {
        existingTests = await fileService.readFile(testFilePath);
      } catch (error) {
        // Test file doesn't exist yet
      }

      // Generate test context
      const testContext = this.createTestContext(
        filePath,
        originalContent,
        existingTests,
        context.prompt || ''
      );

      // Get LLM response for test generation
      const llmResponse = await geminiService.generateResponse([
        { role: 'user', content: testContext }
      ]);

      // Extract code and test statistics from response
      const { code: testCode, stats } = this.extractTestCodeAndStats(llmResponse);

      // Write or update test file
      await fileService.writeFile(testFilePath, testCode);

      // Run the tests
      const runResult = await this.runTests(testFilePath);

      return {
        success: true,
        message: `Tests ${existingTests ? 'updated' : 'created'} at ${testFilePath}\n${runResult}`,
        content: testCode,
        testStats: stats
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in TestAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private getTestFilePath(sourceFilePath: string): string {
    const dir = path.dirname(sourceFilePath);
    const ext = path.extname(sourceFilePath);
    const basename = path.basename(sourceFilePath, ext);
    
    // Handle different testing conventions
    switch (ext) {
      case '.ts':
      case '.tsx':
        return path.join(dir, `${basename}.test${ext}`);
      case '.js':
      case '.jsx':
        return path.join(dir, `${basename}.test${ext}`);
      case '.py':
        return path.join(dir, `test_${basename}.py`);
      case '.rb':
        return path.join(dir, `${basename}_test.rb`);
      default:
        return path.join(dir, `${basename}.test${ext}`);
    }
  }

  private createTestContext(
    filePath: string,
    sourceCode: string,
    existingTests: string,
    prompt: string
  ): string {
    const fileExtension = path.extname(filePath).toLowerCase();
    const framework = this.detectTestFramework(fileExtension, sourceCode);
    
    // Add Python-specific template
    if (fileExtension === '.py') {
      return `
Generate Python tests for the following source code:

Source file: ${filePath}
Framework: ${framework}

Source code:
\`\`\`python
${sourceCode}
\`\`\`

${existingTests ? `Existing tests:
\`\`\`python
${existingTests}
\`\`\`
` : ''}

Additional requirements: ${prompt}

Instructions:
1. Include necessary imports (pytest, unittest, etc.)
2. Create proper test class if using unittest
3. Use pytest fixtures if needed
4. Follow Python testing best practices
5. Include docstrings for test functions
6. Add proper assertions

The test file should start with imports and should be valid Python syntax.
Example structure:
import pytest
from {module} import *

def test_function():
    # test code here

Please provide the complete test file content.

After the test code, please provide test statistics in the following format:
---TEST-STATS---
Total: <number>
Failed: <number>
`;
    }
    
    return `
Generate tests for the following source code:

Source file: ${filePath}
Framework: ${framework}

Source code:
\`\`\`${fileExtension}
${sourceCode}
\`\`\`

${existingTests ? `Existing tests:
\`\`\`${fileExtension}
${existingTests}
\`\`\`
` : ''}

Additional requirements: ${prompt}

Instructions:
1. Create comprehensive tests that cover the main functionality
2. Include test cases for edge cases and error conditions
3. Follow ${framework} testing patterns and best practices
4. Use clear test descriptions that explain what is being tested
5. Include setup and teardown if needed
6. Add comments explaining complex test scenarios

Please provide the complete test file content.

After the test code, please provide test statistics in the following format:
---TEST-STATS---
Total: <number>
Failed: <number>
`;
  }

  private detectTestFramework(fileExtension: string, sourceCode: string): string {
    // Detect testing framework based on file extension and code content
    switch (fileExtension) {
      case '.ts':
      case '.tsx':
        return sourceCode.includes('jest') ? 'Jest' : 'Mocha';
      case '.js':
      case '.jsx':
        return sourceCode.includes('jest') ? 'Jest' : 'Mocha';
      case '.py':
        return sourceCode.includes('pytest') ? 'pytest' : 'unittest';
      case '.rb':
        return 'RSpec';
      case '.go':
        return 'testing';
      case '.java':
        return 'JUnit';
      default:
        return 'Jest';
    }
  }

  private extractTestCode(llmResponse: string): string {
    const codeBlockRegex = /```(?:[\w-]*\n)?([\s\S]*?)```/g;
    const matches = Array.from(llmResponse.matchAll(codeBlockRegex));
    
    if (matches.length > 0) {
      // Use the largest code block
      return matches.reduce((longest, current) => 
        current[1].length > longest.length ? current[1] : longest
      , '').trim();
    }
    
    // If no code blocks found, return the raw response
    return llmResponse;
  }

  private extractTestCodeAndStats(llmResponse: string): { code: string, stats: { total: number, failed: number } } {
    const statsRegex = /---TEST-STATS---\s*Total:\s*(\d+)\s*Failed:\s*(\d+)/;
    const statsMatch = llmResponse.match(statsRegex);
    
    const stats = {
      total: 0,
      failed: 0
    };

    if (statsMatch) {
      stats.total = parseInt(statsMatch[1], 10);
      stats.failed = parseInt(statsMatch[2], 10);
    }

    // Remove stats section from the response
    const cleanResponse = llmResponse.replace(/---TEST-STATS---[\s\S]*$/, '').trim();
    
    // Extract code using existing method
    const code = this.extractTestCode(cleanResponse);

    return { code, stats };
  }

  private async runTests(testFilePath: string): Promise<string> {
    const ext = path.extname(testFilePath);
    const command = this.getTestCommand(ext, testFilePath);
    
    if (!command) {
      return 'Test running not supported for this file type';
    }

    // Resolve full path relative to workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return 'Error: No workspace folder found';
    }

    const fullTestPath = path.isAbsolute(testFilePath) 
      ? testFilePath 
      : path.join(workspaceFolder.uri.fsPath, testFilePath);

    // Add Python-specific validation
    if (ext === '.py') {
      try {
        const testFileUri = vscode.Uri.file(fullTestPath);
        await vscode.workspace.fs.stat(testFileUri);
      } catch (error) {
        return `Error: Test file not found at ${fullTestPath}. Make sure the file exists and you have correct permissions.`;
      }
    }

    // Create or reuse terminal
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal('Test Runner');
    }
    
    this.terminal.show();
    
    // For Python, add virtual environment activation if needed
    if (ext === '.py') {
      const venvPath = path.join(workspaceFolder.uri.fsPath, 'venv');
      const activateCmd = process.platform === 'win32' 
        ? `${venvPath}\\Scripts\\activate` 
        : `source ${venvPath}/bin/activate`;
        
      // Only try to activate if venv exists
      if (await this.pathExists(venvPath)) {
        this.terminal.sendText(activateCmd);
      }
    }
    
    // Use resolved full path in command
    const finalCommand = this.getTestCommand(ext, fullTestPath);
    this.terminal.sendText(finalCommand);
    return `Running tests with command: ${finalCommand}`;
  }

  // Helper method to check if path exists
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  private getTestCommand(ext: string, testPath: string): string {
    // Escape spaces in path
    const escapedPath = testPath.includes(' ') ? `"${testPath}"` : testPath;
    
    switch (ext) {
      case '.ts':
      case '.tsx':
        return `jest ${escapedPath}`;
      case '.js':
      case '.jsx':
        return `jest ${escapedPath}`;
      case '.py':
        return `python -m pytest ${escapedPath} -v`;  // Added -v for verbose output
      case '.rb':
        return `rspec ${escapedPath}`;
      case '.go':
        return `go test ${escapedPath}`;
      case '.java':
        return `./gradlew test --tests "${escapedPath}"`;
      default:
        return '';
    }
  }

  async validate(context: AgentContext): Promise<boolean> {
    if (!context.filePath || !context.originalContent) {
      return false;
    }

    // Check if file extension is supported
    const ext = path.extname(context.filePath).toLowerCase();
    const supportedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go', '.java'];
    
    return supportedExtensions.includes(ext);
  }
}