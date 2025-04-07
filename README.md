# Momo - AI Coding Assistant

Momo is a powerful VS Code extension that serves as an autonomous coding agent powered by the Gemini LLM. It provides intelligent assistance for coding tasks, file management, and more.

## Features

- 🤖 **AI-Powered Assistance**: Powered by Gemini 2.0 Flash LLM for fast and efficient responses
- 📝 **File Management**: Create, edit, and delete files and folders
- 💡 **Intelligent Code Editing**: Process and apply intelligent code changes
- 🎯 **Command Palette Integration**: Quick access to all Momo features through VS Code commands
- 🎨 **Sidebar Interface**: Dedicated sidebar for easy interaction with the AI assistant

## Installation

1. Download the VSIX package from the releases section
2. Open VS Code
3. Go to the Extensions view (Ctrl+Shift+X)
4. Click on the "..." menu and select "Install from VSIX"
5. Choose the downloaded VSIX file

## Configuration

Momo requires a Gemini API key to function. You can configure it in VS Code settings:

1. Open VS Code settings (Ctrl+,)
2. Search for "Momo"
3. Enter your Gemini API key in the `momo.apiKey` setting

## Available Commands

- `Momo: Ask a question` - Ask Momo any coding-related question
- `Momo: Start agent mode` - Activate autonomous agent mode
- `Momo: Apply suggested changes` - Apply AI-suggested code changes
- `Momo: Reject suggested changes` - Reject AI-suggested code changes
- `Momo: Process intelligent edits` - Process AI-generated code edits
- `Momo: Create File` - Create a new file
- `Momo: Create Folder` - Create a new folder
- `Momo: Delete File` - Delete a file
- `Momo: Delete Folder` - Delete a folder

## Command Syntax

Momo supports several command prefixes for different operations:

### File Operations
- `@file/path/to/file` - Reference a file in your workspace
- `@folder/path/to/folder` - Reference a folder in your workspace
- `/newfile.js` - Create a new file
- `#existingfile.js` - Edit an existing file

### Code Execution
- `@run path/to/file` - Execute a file with intelligent analysis
  - Automatically detects file type and framework
  - Sets up necessary environment
  - Runs the file with appropriate command
  - For web apps, opens the browser automatically
  - Supported file types: .js, .ts, .py, .rb, .go, .java, .php, .rs, .cpp, .cc, .c, .sh, .ps1, .R, .jl

### Code Fixing
- `@fix path/to/file` - Analyze and fix issues in a file
  - Identifies potential bugs
  - Suggests improvements
  - Applies fixes with your approval

## Development

### Prerequisites

- Node.js 20.x or later
- VS Code 1.97.0 or later
- TypeScript 5.7.3 or later

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run compile
   ```

### Development Scripts

- `npm run compile` - Compile the TypeScript code
- `npm run watch` - Watch for changes and compile automatically
- `npm run lint` - Run ESLint
- `npm test` - Run tests

## Dependencies

### Production Dependencies
- @google/generative-ai: ^0.2.1
- diff: ^5.1.0
- marked: ^9.1.5

### Development Dependencies
- @types/diff: ^7.0.1
- @types/mocha: ^10.0.10
- @types/node: 20.x
- @types/vscode: ^1.97.0
- @typescript-eslint/eslint-plugin: ^8.25.0
- @typescript-eslint/parser: ^8.25.0
- @vscode/test-cli: ^0.0.10
- @vscode/test-electron: ^2.4.1
- eslint: ^9.21.0
- typescript: ^5.7.3

## License

This project is licensed under the MIT License - see the LICENSE file for details.


**Enjoy coding with Momo!**
