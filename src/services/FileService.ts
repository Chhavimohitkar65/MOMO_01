import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class FileService {
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * Read the content of a file
   * @param filePath Path to the file
   * @returns File content as string
   */
  public async readFile(filePath: string): Promise<string> {
    try {
      // Handle relative paths
      const absolutePath = this.resolveFilePath(filePath);
      
      // Read the file
      const uri = vscode.Uri.file(absolutePath);
      const content = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(content).toString('utf-8');
    } catch (error) {
      throw new Error(`Could not read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Write content to a file
   * @param filePath Path to the file
   * @param content Content to write
   * @returns True if successful
   */
  public async writeFile(filePath: string, content: string): Promise<void> {
    try {
      // Create full path using workspace root
      const fullPath = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', filePath);
      
      // Ensure directory exists
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.file(path.dirname(fullPath))
      );

      // Write file using VS Code API
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(fullPath),
        Buffer.from(content, 'utf-8')
      );
    } catch (error) {
      console.error('Error writing file:', error);
      throw new Error(`Failed to write file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Edit a file with specific changes
   * @param filePath Path to the file
   * @param edits Array of edits to apply
   * @returns True if successful
   */
  public async editFile(filePath: string, edits: { range: vscode.Range; text: string }[]): Promise<boolean> {
    try {
      // Handle # syntax for editing files
      if (filePath.startsWith('#')) {
        filePath = filePath.substring(1);
      }

      const uri = vscode.Uri.file(this.resolveFilePath(filePath));
      const document = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      
      for (const e of edits) {
        edit.replace(uri, e.range, e.text);
      }
      
      return await vscode.workspace.applyEdit(edit);
    } catch (error) {
      console.error(`Error editing file ${filePath}:`, error);
      throw new Error(`Failed to edit file ${filePath}: ${error}`);
    }
  }

  /**
   * Get file or folder information
   * @param resourcePath Path to the file or folder
   * @returns Information about the resource
   */
  public async getResourceInfo(resourcePath: string): Promise<any> {
    try {
      // Handle @folder syntax
      if (resourcePath.startsWith('@')) {
        resourcePath = resourcePath.substring(1);
      }
      const uri = vscode.Uri.file(this.resolveFilePath(resourcePath));
      const stat = await vscode.workspace.fs.stat(uri);
      
      if (stat.type === vscode.FileType.Directory) {
        // It's a directory, list its contents
        const entries = await vscode.workspace.fs.readDirectory(uri);
        return {
          type: 'directory',
          name: path.basename(resourcePath),
          path: resourcePath,
          contents: entries.map(([name, type]) => ({
            name,
            type: type === vscode.FileType.Directory ? 'directory' : 'file'
          }))
        };
      } else {
        // It's a file, return its info
        return {
          type: 'file',
          name: path.basename(resourcePath),
          path: resourcePath,
          size: stat.size
        };
      }
    } catch (error) {
      console.error(`Error getting resource info for ${resourcePath}:`, error);
      throw new Error(`Failed to get resource info for ${resourcePath}: ${error}`);
    }
  }

  /**
   * Resolve a file path to a URI
   * @param filePath Relative or absolute file path
   * @returns VS Code URI
   */
  private resolveFilePath(filePath: string): string {
    // If it's already an absolute path, return it
    if (path.isAbsolute(filePath)) {
      return filePath;
    }

    // Get the workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      throw new Error('No workspace folder found');
    }

    // Resolve relative to the first workspace folder
    return path.join(workspaceFolders[0].uri.fsPath, filePath);
  }

  /**
   * Check if a file exists
   */
  public async fileExists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(this.resolveFilePath(filePath));
      const stat = await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List directory contents
   */
  public async listDirectory(dirPath: string): Promise<[string, vscode.FileType][]> {
    try {
      const uri = vscode.Uri.file(this.resolveFilePath(dirPath));
      const entries = await vscode.workspace.fs.readDirectory(uri);
      return entries;
    } catch (error) {
      throw new Error(`Could not list directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a directory
   */
  public async createDirectory(dirPath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(this.resolveFilePath(dirPath));
      await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
      throw new Error(`Could not create directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a file or directory
   */
  public async delete(path: string, options?: { recursive?: boolean }): Promise<void> {
    try {
      const uri = vscode.Uri.file(this.resolveFilePath(path));
      await vscode.workspace.fs.delete(uri, options);
    } catch (error) {
      throw new Error(`Could not delete ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 