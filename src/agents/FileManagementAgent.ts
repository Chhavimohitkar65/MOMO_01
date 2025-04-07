import { BaseAgent, AgentContext, AgentResponse } from './BaseAgent';
import * as vscode from 'vscode';
import * as path from 'path';

export class FileManagementAgent implements BaseAgent {
  id = 'file-management-agent';
  name = 'File Management Agent';
  description = 'Creates and deletes files and folders';
  commandPrefix = '@';

  canHandle(input: string): boolean {
    return ['@createfile', '@createfolder', '@deletefile', '@deletefolder'].some(cmd => 
      input.toLowerCase().startsWith(cmd)
    );
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      const { prompt } = context;
      if (!prompt) {
        return { success: false, message: 'No command provided' };
      }

      // Get workspace root
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceRoot) {
        return { success: false, message: 'No workspace folder found' };
      }

      // Improved command parsing
      const commandPattern = /^@(createfile|createfolder|deletefile|deletefolder)\s+(.+)$/i;
      const match = prompt.match(commandPattern);

      if (!match) {
        return { success: false, message: 'Invalid command format. Use @createfile <filename> or @createfolder <foldername>' };
      }

      const [, command, name] = match;

      if (!name || name.trim().length === 0) {
        return { success: false, message: 'No name provided' };
      }

      // Create full path URI using workspace root
      const targetUri = vscode.Uri.joinPath(workspaceRoot.uri, name.trim());

      try {
        switch (command.toLowerCase()) {
          case 'createfile':
            await vscode.workspace.fs.writeFile(targetUri, new Uint8Array());
            return { 
              success: true, 
              message: `File created: ${name} in ${workspaceRoot.name}` 
            };

          case 'createfolder':
            await vscode.workspace.fs.createDirectory(targetUri);
            return { 
              success: true, 
              message: `Folder created: ${name} in ${workspaceRoot.name}` 
            };

          case 'deletefile':
            await vscode.workspace.fs.delete(targetUri, { useTrash: true });
            return { 
              success: true, 
              message: `File deleted: ${name} from ${workspaceRoot.name}` 
            };

          case 'deletefolder':
            await vscode.workspace.fs.delete(targetUri, { 
              recursive: true, 
              useTrash: true 
            });
            return { 
              success: true, 
              message: `Folder deleted: ${name} from ${workspaceRoot.name}` 
            };

          default:
            return { success: false, message: 'Invalid command' };
        }
      } catch (error) {
        return {
          success: false,
          message: `Operation failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validate(context: AgentContext): Promise<boolean> {
    if (!context.prompt) {
      return false;
    }
    return this.canHandle(context.prompt);
  }
}
