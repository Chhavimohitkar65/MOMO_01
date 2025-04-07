import { BaseAgent, AgentContext, AgentResponse } from '../BaseAgent';

export class NewAgent implements BaseAgent {
  id = 'new-agent';
  name = 'New Agent';
  description = 'Description of what this agent does';
  commandPrefix = '@new';

  canHandle(input: string): boolean {
    return input.startsWith(this.commandPrefix);
  }

  async execute(context: AgentContext): Promise<AgentResponse> {
    try {
      // Implement agent-specific logic here
      return {
        success: true,
        message: 'Agent execution successful'
      };
    } catch (error) {
      return {
        success: false,
        message: `Error in NewAgent: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  async validate(context: AgentContext): Promise<boolean> {
    // Implement validation logic if needed
    return true;
  }
} 