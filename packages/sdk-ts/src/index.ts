export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CompletionOptions {
  provider: string;
  messages: ChatMessage[];
  agentMode?: boolean;
}

export interface SearchOptions {
  query: string;
  engine?: 'google' | 'bing' | 'perplexity';
  maxResults?: number;
}

export class OmniBridge {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'http://localhost:3000';
  }

  // Unified model interaction bindings
  async complete(options: CompletionOptions) {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        provider: options.provider,
        messages: options.messages,
        agent_mode: options.agentMode ?? false
      })
    });
    return response.json();
  }

  // Universal Live Internet Data query binding
  async search(options: SearchOptions) {
    const response = await fetch(`${this.baseUrl}/v1/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        query: options.query,
        engine: options.engine || 'google',
        max_results: options.maxResults ?? 5
      })
    });
    return response.json();
  }
}
