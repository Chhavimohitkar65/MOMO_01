import * as vscode from 'vscode';
import { FileService } from '../services/FileService';
import { GeminiService } from '../services/GeminiService';
import { DiffService } from '../services/DiffService';

export interface AgentContext {
  filePath?: string;
  content?: string;
  prompt?: string;
  originalContent?: string;
  fileService: FileService;
  geminiService: GeminiService;
  diffService: DiffService;
}

export interface AgentResponse {
  success: boolean;
  message: string;
  content?: string;
  edits?: any[];
  testStats?: {
    total: number;
    failed: number;
  };
}

export interface BaseAgent {
  // Unique identifier for the agent
  id: string;
  
  // Display name for the agent
  name: string;
  
  // Description of what the agent does
  description: string;
  
  // Command prefix that triggers this agent (e.g., #, @, /, etc.)
  commandPrefix: string;
  
  // Whether the agent can handle the given input
  canHandle(input: string): boolean;
  
  // Execute the agent's task
  execute(context: AgentContext): Promise<AgentResponse>;
  
  // Optional validation function
  validate?(context: AgentContext): Promise<boolean>;
}