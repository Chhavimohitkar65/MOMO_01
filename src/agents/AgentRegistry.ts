import { BaseAgent } from './BaseAgent';
import { RunAgent } from './RunAgent';
import { ErrorFixAgent } from './ErrorFixAgent';
import { FileManagementAgent } from './FileManagementAgent';

export class AgentRegistry {
  private static instance: AgentRegistry;
  private agents: Map<string, BaseAgent> = new Map();

  private constructor() {
    this.registerAgent(new RunAgent());
    // Ensure single ErrorFixAgent instance
    const errorFixAgent = new ErrorFixAgent();
    this.registerAgent(errorFixAgent);
    this.registerAgent(new FileManagementAgent());
  }

  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  public registerAgent(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent with ID ${agent.id} is already registered`);
    }
    this.agents.set(agent.id, agent);
  }

  public getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  public getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  public findAgentForInput(input: string): BaseAgent | undefined {
    return Array.from(this.agents.values()).find(agent => agent.canHandle(input));
  }
}