declare module '@google/generative-ai' {
  export class GoogleGenerativeAI {
    constructor(apiKey: string);
    getGenerativeModel(options: { model: string }): GenerativeModel;
  }

  export interface GenerationConfig {
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
  }

  export interface GenerativeModel {
    startChat(options?: {
      history?: any[];
      generationConfig?: GenerationConfig;
      tools?: any[];
    }): ChatSession;
  }

  export interface ChatSession {
    sendMessage(text: string): Promise<{ response: ChatResponse }>;
  }

  export interface ChatResponse {
    text(): string;
    functionCalls?: Array<{
      name: string;
      args: Record<string, any>;
    }>;
  }
}

declare module 'marked' {
  export function marked(markdown: string): string;
} 