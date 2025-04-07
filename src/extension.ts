// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';
import { GeminiService } from './services/GeminiService';
import { FileService } from './services/FileService';
import { DiffService } from './services/DiffService';

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Create output channel
	outputChannel = vscode.window.createOutputChannel('Momo');
	outputChannel.show();
	outputChannel.appendLine('Activating Momo extension...');

	try {
		// Initialize services
		const geminiService = new GeminiService(context);
		const fileService = new FileService(context);
		const diffService = new DiffService();

		// Register sidebar webview provider
		const sidebarProvider = new SidebarProvider(
			context, 
			geminiService, 
			fileService, 
			diffService
		);
		
		const sidebarRegistration = vscode.window.registerWebviewViewProvider(
			'momoSidebar',
			sidebarProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Register commands
		const askCommand = vscode.commands.registerCommand('momo.ask', () => {
			vscode.commands.executeCommand('workbench.view.extension.momo-sidebar');
			sidebarProvider.setMode('ask');
		});

		const agentCommand = vscode.commands.registerCommand('momo.agent', () => {
			vscode.commands.executeCommand('workbench.view.extension.momo-sidebar');
			sidebarProvider.setMode('agent');
		});

		const applyChangesCommand = vscode.commands.registerCommand('momo.applyChanges', () => {
			diffService.applyChanges();
		});

		const rejectChangesCommand = vscode.commands.registerCommand('momo.rejectChanges', () => {
			diffService.rejectChanges();
		});

		// Add to subscriptions
		context.subscriptions.push(
			sidebarRegistration,
			askCommand,
			agentCommand,
			applyChangesCommand,
			rejectChangesCommand,
			outputChannel
		);

		// Set default API key if provided
		const config = vscode.workspace.getConfiguration('momo');
		if (!config.get('apiKey')) {
			config.update('apiKey', 'AIzaSyB4hiLV6LGufxe_FQlH2TnNPZUVyEtTyVA', vscode.ConfigurationTarget.Global);
		}

		// Show welcome message
		vscode.window.showInformationMessage('Momo is now active! Click the Momo icon in the activity bar to get started.');
		outputChannel.appendLine('Momo extension activated successfully!');
	} catch (error) {
		outputChannel.appendLine(`Error activating Momo extension: ${error}`);
		vscode.window.showErrorMessage(`Failed to activate Momo: ${error}`);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	outputChannel?.appendLine('Deactivating Momo extension...');
	outputChannel?.dispose();
}
