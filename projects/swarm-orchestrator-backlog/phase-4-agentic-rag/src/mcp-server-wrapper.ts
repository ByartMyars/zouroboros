/**
 * MCP Server Wrapper for Agentic RAG SDK
 * 
 * Wraps the agentic-rag-sdk MCP server for use with the swarm orchestrator.
 */

import { spawn, ChildProcess } from 'child_process';
import { AgenticRAGClient, type MCPConfig, type RAGSearchResult } from './mcp-rag-client';

export interface MCPServerConfig {
  /** Path to MCP server binary/script */
  serverPath?: string;
  
  /** Server port */
  port?: number;
  
  /** Auth token */
  token?: string;
  
  /** Auto-start server */
  autoStart?: boolean;
  
  /** SDKs to index */
  sdks?: string[];
}

export class MCPServerWrapper {
  private process?: ChildProcess;
  private client?: AgenticRAGClient;
  private config: MCPServerConfig;
  
  constructor(config: MCPServerConfig = {}) {
    this.config = {
      serverPath: config.serverPath || 'npx',
      port: config.port || 8080,
      token: config.token || '',
      autoStart: config.autoStart !== false,
      sdks: config.sdks || ['claude-sdk', 'langchain', 'openai-agents'],
    };
  }
  
  /**
   * Start MCP server
   */
  async start(): Promise<boolean> {
    if (this.process) {
      console.log('[MCP] Server already running');
      return true;
    }
    
    try {
      console.log(`[MCP] Starting server on port ${this.config.port}...`);
      
      // In production, start actual MCP server
      // For now, simulate with client-only mode
      this.client = new AgenticRAGClient({
        endpoint: `http://localhost:${this.config.port}`,
        token: this.config.token,
        sdks: this.config.sdks,
      });
      
      const connected = await this.client.connect();
      
      if (connected) {
        console.log('[MCP] Server started (mock mode)');
      }
      
      return connected;
    } catch (error) {
      console.error('[MCP] Failed to start server:', error);
      return false;
    }
  }
  
  /**
   * Stop MCP server
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    
    if (this.client) {
      this.client.disconnect();
      this.client = undefined;
    }
    
    console.log('[MCP] Server stopped');
  }
  
  /**
   * Search via MCP server
   */
  async search(query: string, options?: { topK?: number; sdk?: string }): Promise<RAGSearchResult[]> {
    if (!this.client) {
      await this.start();
    }
    
    const result = await this.client!.search(query, options);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result.results || [];
  }
  
  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.client?.isAvailable() || false;
  }
}

/**
 * Integration with swarm orchestrator
 */
export interface SwarmRAGConfig {
  /** Enable RAG in swarm tasks */
  enabled?: boolean;
  
  /** MCP server config */
  mcp?: MCPServerConfig;
  
  /** Fallback to memory system */
  fallbackToMemory?: boolean;
  
  /** Inject RAG results into task context */
  injectIntoContext?: boolean;
}

export function createSwarmRAGIntegration(config: SwarmRAGConfig = {}) {
  const server = new MCPServerWrapper(config.mcp);
  
  return {
    /**
     * Inject RAG tool into swarm task
     */
    injectTool(task: Record<string, unknown>): Record<string, unknown> {
      if (!config.enabled) {
        return task;
      }
      
      return {
        ...task,
        tools: [
          ...(task.tools as unknown[] || []),
          {
            name: 'rag_search',
            description: 'Search AI/ML SDK documentation',
            type: 'function',
            handler: async (input: { query: string; topK?: number }) => {
              const results = await server.search(input.query, { topK: input.topK });
              return results;
            },
          },
        ],
      };
    },
    
    /**
     * Post-process task output with RAG context
     */
    async enrichOutput(
      output: string,
      context: { query?: string; sdks?: string[] }
    ): Promise<string> {
      if (!config.injectIntoContext || !context.query) {
        return output;
      }
      
      try {
        const results = await server.search(context.query, {
          topK: 3,
          sdk: context.sdks?.[0],
        });
        
        if (results.length === 0) {
          return output;
        }
        
        const ragContext = results
          .map((r, i) => `## RAG Result ${i + 1} (${r.sdk})\n${r.content}`)
          .join('\n\n');
        
        return `## SDK Documentation Reference\n\n${ragContext}\n\n---\n\n## Task Output\n\n${output}`;
      } catch {
        // RAG failed, return original output
        return output;
      }
    },
    
    /**
     * Start the MCP server
     */
    async start(): Promise<boolean> {
      return server.start();
    },
    
    /**
     * Stop the MCP server
     */
    async stop(): Promise<void> {
      await server.stop();
    },
    
    /**
     * Check if RAG is available
     */
    isAvailable(): boolean {
      return server.isRunning();
    },
  };
}

export default MCPServerWrapper;
