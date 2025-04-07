import * as vscode from 'vscode';
import { GoogleGenerativeAI, GenerativeModel, GenerationConfig } from '@google/generative-ai';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class GeminiService {
  private context: vscode.ExtensionContext;
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;
  private apiKey: string = '';
  private readonly modelName: string = 'gemini-2.0-flash';

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initialize();

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('momo.apiKey')) {
        this.initialize();
      }
    });
  }

  private initialize() {
    const config = vscode.workspace.getConfiguration('momo');
    this.apiKey = config.get('apiKey') as string;

    if (this.apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: this.modelName });
        console.log(`Initialized Gemini 2.0 Flash model`);
      } catch (error) {
        console.error('Failed to initialize Gemini API:', error);
        vscode.window.showErrorMessage('Failed to initialize Gemini API. Please check your API key.');
      }
    } else {
      vscode.window.showWarningMessage('Gemini API key not set. Please set it in the extension settings.');
    }
  }

  private getModelConfig(): GenerationConfig {
    return {
      temperature: 0.3, // Lower temperature for more focused responses
      topK: 20,
      topP: 0.8,
      maxOutputTokens: 4096, // Shorter responses for faster generation
    };
  }

  public async generateResponse(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    if (!this.model) {
      throw new Error('Gemini model not initialized. Please check your API key.');
    }

    try {
      // Prepare the chat history
      const history: ChatMessage[] = [];
      
      // Add system prompt if provided
      if (systemPrompt) {
        history.push({ role: 'system', content: systemPrompt });
      }
      
      // Add user messages
      history.push(...messages);

      // Convert to format expected by Gemini
      const geminiMessages = history.map(msg => {
        return {
          role: msg.role === 'assistant' ? 'model' : msg.role,
          parts: [{ text: msg.content }]
        };
      });

      // Generate response with model-specific configuration
      const chat = this.model.startChat({
        generationConfig: this.getModelConfig(),
        history: geminiMessages.slice(0, -1) as any, // All except the last message
      });

      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const response = result.response.text();
      
      return response;
    } catch (error) {
      console.error('Error generating response:', error);
      throw new Error(`Failed to generate response: ${error}`);
    }
  }

  public async generateWithToolCalling(
    messages: ChatMessage[], 
    tools: any[], 
    systemPrompt?: string
  ): Promise<any> {
    if (!this.model) {
      throw new Error('Gemini model not initialized. Please check your API key.');
    }

    try {
      // Prepare the chat history with system prompt
      const history: ChatMessage[] = [];
      
      if (systemPrompt) {
        history.push({ role: 'system', content: systemPrompt });
      }
      
      history.push(...messages);

      // Convert to format expected by Gemini
      const geminiMessages = history.map(msg => {
        return {
          role: msg.role === 'assistant' ? 'model' : msg.role,
          parts: [{ text: msg.content }]
        };
      });

      // Generate response with tool calling and model-specific configuration
      const chat = this.model.startChat({
        generationConfig: {
          ...this.getModelConfig(),
          temperature: 0.2, // Lower temperature for more precise tool calling
        },
        tools: tools,
        history: geminiMessages.slice(0, -1) as any,
      });

      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      return result.response;
    } catch (error) {
      console.error('Error in tool calling:', error);
      throw new Error(`Failed in tool calling: ${error}`);
    }
  }
} 