import * as vscode from 'vscode';
import * as diff from 'diff';

interface PendingChange {
  uri: vscode.Uri;
  originalContent: string;
  newContent: string;
  diffHtml: string;
}

export class DiffService {
  private pendingChanges: Map<string, PendingChange> = new Map();
  private diffPanel: vscode.WebviewPanel | null = null;

  /**
   * Create a diff between original and new content
   * @param filePath Path to the file
   * @param originalContent Original file content
   * @param newContent New file content
   * @returns HTML representation of the diff
   */
  public createDiff(filePath: string, originalContent: string, newContent: string): string {
    // Strip extension when storing/comparing files
    const normalizedPath = this.stripFileExtension(filePath);
    const uri = this.getFileUri(filePath);
    const changes = diff.diffLines(originalContent, newContent);
    
    // Generate HTML for the diff
    let diffHtml = `<div class="diff-container">
      <div class="diff-header">${normalizedPath}</div>
      <div class="diff-content">`;
    
    for (const change of changes) {
      if (change.added) {
        diffHtml += `<div class="diff-line diff-added">+ ${this.escapeHtml(change.value)}</div>`;
      } else if (change.removed) {
        diffHtml += `<div class="diff-line diff-removed">- ${this.escapeHtml(change.value)}</div>`;
      } else {
        diffHtml += `<div class="diff-line diff-unchanged"> ${this.escapeHtml(change.value)}</div>`;
      }
    }
    
    diffHtml += `</div></div>`;
    
    // Store the pending change
    this.pendingChanges.set(uri.toString(), {
      uri,
      originalContent,
      newContent,
      diffHtml
    });
    
    return diffHtml;
  }

  /**
   * Show diff in a webview panel
   * @param filePath Path to the file
   * @param originalContent Original file content
   * @param newContent New file content
   */
  public showDiff(filePath: string, originalContent: string, newContent: string): void {
    const diffHtml = this.createDiff(filePath, originalContent, newContent);
    
    if (!this.diffPanel) {
      this.diffPanel = vscode.window.createWebviewPanel(
        'momoDiff',
        'Momo: File Changes',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      
      this.diffPanel.onDidDispose(() => {
        this.diffPanel = null;
      });
    }
    
    const cssStyles = `
      <style>
        body { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
        .diff-container { margin-bottom: 20px; border: 1px solid var(--vscode-panel-border); }
        .diff-header { background-color: var(--vscode-editor-background); padding: 8px; font-weight: bold; border-bottom: 1px solid var(--vscode-panel-border); }
        .diff-content { white-space: pre; font-family: monospace; }
        .diff-line { padding: 0 8px; }
        .diff-added { background-color: rgba(0, 255, 0, 0.1); color: var(--vscode-gitDecoration-addedResourceForeground); }
        .diff-removed { background-color: rgba(255, 0, 0, 0.1); color: var(--vscode-gitDecoration-deletedResourceForeground); }
        .diff-unchanged { color: var(--vscode-editor-foreground); }
        .actions { margin-top: 20px; display: flex; gap: 10px; }
        button { padding: 8px 16px; cursor: pointer; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; }
        button:hover { background-color: var(--vscode-button-hoverBackground); }
      </style>
    `;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Momo: File Changes</title>
        ${cssStyles}
      </head>
      <body>
        <h2>Proposed Changes</h2>
        ${diffHtml}
        <div class="actions">
          <button id="apply">Apply Changes</button>
          <button id="reject">Reject Changes</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          document.getElementById('apply').addEventListener('click', () => {
            vscode.postMessage({ command: 'apply' });
          });
          document.getElementById('reject').addEventListener('click', () => {
            vscode.postMessage({ command: 'reject' });
          });
        </script>
      </body>
      </html>
    `;
    
    this.diffPanel.webview.html = htmlContent;
    
    this.diffPanel.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'apply':
          vscode.commands.executeCommand('momo.applyChanges');
          break;
        case 'reject':
          vscode.commands.executeCommand('momo.rejectChanges');
          break;
      }
    });
  }

  /**
   * Apply pending changes
   */
  public async applyChanges(): Promise<void> {
    for (const [uriString, change] of this.pendingChanges.entries()) {
      try {
        // Strip extension when comparing files
        const normalizedPath = this.stripFileExtension(change.uri.fsPath);
        const document = await vscode.workspace.openTextDocument(change.uri);
        const edit = new vscode.WorkspaceEdit();
        
        const fullRange = new vscode.Range(
          document.positionAt(0),
          document.positionAt(document.getText().length)
        );
        
        edit.replace(change.uri, fullRange, change.newContent);
        await vscode.workspace.applyEdit(edit);
        
        // Show message without extension
        vscode.window.showInformationMessage(`Changes applied to ${normalizedPath}`);
      } catch (error) {
        const normalizedPath = this.stripFileExtension(change.uri.fsPath);
        vscode.window.showErrorMessage(`Failed to apply changes to ${normalizedPath}: ${error}`);
      }
    }
    
    this.pendingChanges.clear();
    if (this.diffPanel) {
      this.diffPanel.dispose();
    }
  }

  /**
   * Reject pending changes
   */
  public rejectChanges(): void {
    this.pendingChanges.clear();
    vscode.window.showInformationMessage('Changes rejected');
    
    if (this.diffPanel) {
      this.diffPanel.dispose();
    }
  }

  /**
   * Get file URI from path
   * @param filePath File path
   * @returns VS Code URI
   */
  private getFileUri(filePath: string): vscode.Uri {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder is open');
    }
    
    return vscode.Uri.joinPath(workspaceFolders[0].uri, filePath);
  }

  /**
   * Escape HTML special characters
   * @param text Text to escape
   * @returns Escaped text
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Strip file extension from path
   * @param filePath File path
   * @returns Path without extension
   */
  private stripFileExtension(filePath: string): string {
    const lastDotIndex = filePath.lastIndexOf('.');
    const lastSlashIndex = Math.max(
      filePath.lastIndexOf('/'),
      filePath.lastIndexOf('\\')
    );
    
    // Only strip extension if the dot comes after the last slash/backslash
    if (lastDotIndex > lastSlashIndex && lastDotIndex !== -1) {
      return filePath.substring(0, lastDotIndex);
    }
    return filePath;
  }
}