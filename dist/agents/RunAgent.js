"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RunAgent = void 0;
class RunAgent {
    constructor() {
        this.id = 'run-agent';
        this.name = 'Run Agent';
        this.description = 'Executes code and commands in the workspace';
        this.commandPrefix = '@run';
    }
    canHandle(input) {
        return input.startsWith(this.commandPrefix);
    }
    async execute(context) {
        try {
            const { prompt, filePath } = context;
            if (!prompt && !filePath) {
                return {
                    success: false,
                    message: 'Please specify a file to run or a command to execute'
                };
            }
            // If only a file path is provided, try to run it directly
            if (filePath && !prompt) {
                const ext = filePath.split('.').pop()?.toLowerCase();
                switch (ext) {
                    case 'html':
                        return {
                            success: true,
                            message: `Opening ${filePath} in browser`,
                            content: `start ${filePath}`
                        };
                    case 'js':
                        return {
                            success: true,
                            message: `Running JavaScript file: ${filePath}`,
                            content: `node ${filePath}`
                        };
                    default:
                        return {
                            success: false,
                            message: `Unsupported file type: ${ext}`
                        };
                }
            }
            // Handle command if provided
            const command = prompt.substring(this.commandPrefix.length).trim();
            return {
                success: true,
                message: `Executing command: ${command}`,
                content: command
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error executing command: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
exports.RunAgent = RunAgent;
//# sourceMappingURL=RunAgent.js.map