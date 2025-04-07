# Momo - AI Coding Assistant

Momo is a VS Code extension that provides an AI coding assistant powered by Google's Gemini LLM. It helps you with coding tasks, answering questions, and performing actions in your codebase.

## Features

- **Ask Mode**: Chat with Momo about your code, ask questions, and get help with coding tasks.
- **Agent Mode**: Let Momo perform actions in your codebase, such as creating, reading, and editing files.
- **File References**: Use `@file/folder` syntax to reference files and folders in your messages.
- **File Creation**: Use `/filename` syntax to create new files.
- **File Editing**: Use `#filename` syntax to edit existing files.
- **Diff View**: See proposed changes in a diff view before applying them.

## Getting Started

1. Install the extension from the VS Code Marketplace.
2. Set your Gemini API key in the extension settings.
3. Open the Momo sidebar by clicking on the Momo icon in the activity bar.
4. Choose between "Ask" and "Agent" modes.
5. Start chatting with Momo!

## Usage

### Ask Mode

In Ask mode, you can chat with Momo about your code and ask questions. You can reference files using the `@file/folder` syntax:

```
@src/index.js What does this file do?
```

Momo will read the file and provide information about it.

### Agent Mode

In Agent mode, Momo can perform actions in your codebase:

1. **Reading Files**: Use `@file/folder` syntax to read files.
   ```
   @src/index.js
   ```

2. **Creating Files**: Use `/filename` syntax to create new files.
   ```
   /src/utils.js
   
   // Create a utility function
   export function formatDate(date) {
     return new Date(date).toLocaleDateString();
   }
   ```

3. **Editing Files**: Use `#filename` syntax to edit existing files.
   ```
   #src/index.js
   
   // Add this import at the top
   import { formatDate } from './utils';
   ```

## Configuration

- **API Key**: Set your Gemini API key in the extension settings.
- **Default Model**: Choose between different Gemini models.

## Requirements

- VS Code 1.98.0 or higher
- Gemini API key

## Privacy

Your code and conversations are sent to Google's Gemini API for processing. Please review Google's privacy policy for more information.

## License

This extension is licensed under the MIT License.

## Feedback and Contributions

Feedback and contributions are welcome! Please open an issue or submit a pull request on the GitHub repository.

---

**Enjoy coding with Momo!**
