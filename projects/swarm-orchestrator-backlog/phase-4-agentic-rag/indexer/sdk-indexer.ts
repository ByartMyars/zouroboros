/**
 * SDK Documentation Indexer
 * Indexes SDK documentation into Qdrant using Ollama embeddings
 * 
 * Local-first: Uses Ollama (nomic-embed-text) for embeddings.
 * No external API costs, unlimited RPM, fully private.
 */

import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

// Ollama configuration
const OLLAMA_URL = 'http://localhost:11434/api/embeddings';
const EMBEDDING_MODEL = 'nomic-embed-text';

interface SDKDoc {
  content: string;
  sdk: string;
  source: string;
}

const SDK_DOCS: Record<string, SDKDoc[]> = {
  'claude-sdk': [
    {
      sdk: 'claude-sdk',
      source: 'api-reference/messages.md',
      content: `import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

const message = await client.messages.create({
  model: "claude-opus-4-5-20251120",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }]
});

console.log(message.content);`,
    },
    {
      sdk: 'claude-sdk',
      source: 'api-reference/streaming.md',
      content: `import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

const stream = await client.messages.stream({
  model: "claude-opus-4-5-20251120",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Hello" }]
});

for await (const event of stream) {
  if (event.type === "content_block_delta") {
    process.stdout.write(event.delta.text);
  }
}`,
    },
    {
      sdk: 'claude-sdk',
      source: 'api-reference/images.md',
      content: `import { Anthropic } from "@anthropic-ai/sdk";
import * as fs from 'fs';

const imageData = fs.readFileSync('./photo.jpg', { encoding: 'base64' });

const message = await client.messages.create({
  model: "claude-opus-4-5-20251120",
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageData } },
      { type: "text", text: "What is in this image?" }
    ]
  }]
});`,
    },
    {
      sdk: 'claude-sdk',
      source: 'quickstart.md',
      content: `import { Anthropic } from "@anthropic-ai/sdk";

const client = new Anthropic();

// Simple synchronous call
const message = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  messages: [{ role: "user", content: "Hello, Claude" }]
});

console.log(message.content);`,
    },
    {
      sdk: 'claude-sdk',
      source: 'error-handling.md',
      content: `import { Anthropic, RateLimitError, APIError } from "@anthropic-ai/sdk";

try {
  const message = await client.messages.create({
    model: "claude-opus-4-5-20251120",
    messages: [{ role: "user", content: "Hello" }]
  });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log("Rate limited, waiting...", error.retryAfter);
  } else if (error instanceof APIError) {
    console.error("API Error:", error.status, error.message);
  }
}`,
    },
  ],
  'langchain': [
    {
      sdk: 'langchain',
      source: 'chat_models.md',
      content: `from langchain.chat_models import ChatOpenAI
from langchain.schema import HumanMessage, SystemMessage

chat = ChatOpenAI(model="gpt-4", temperature=0)
response = chat([HumanMessage(content="Hello!")])
print(response.content)`,
    },
    {
      sdk: 'langchain',
      source: 'embeddings.md',
      content: `from langchain.embeddings import OpenAIEmbeddings

embeddings = OpenAIEmbeddings()
doc_result = embeddings.embed_documents(["Hello world", "Goodbye"])
query_result = embeddings.embed_query("What is the meaning?")`,
    },
    {
      sdk: 'langchain',
      source: 'vectorstores.md',
      content: `from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings

db = Chroma.from_documents(docs, OpenAIEmbeddings())
query = "What did the cat say?"
docs = db.similarity_search(query)`,
    },
    {
      sdk: 'langchain',
      source: 'chains.md',
      content: `from langchain.chains import LLMChain
from langchain.prompts import PromptTemplate
from langchain.llms import OpenAI

template = "What is a good name for a company that makes {product}?"
prompt = PromptTemplate(template=template, input_variables=["product"])
chain = LLMChain(llm=OpenAI(), prompt=prompt)
result = chain.run("colorful socks")`,
    },
    {
      sdk: 'langchain',
      source: 'agents.md',
      content: `from langchain.agents import initialize_agent, Tool
from langchain.tools import DuckDuckGoSearchRun

search = DuckDuckGoSearchRun()
tools = [Tool(name="Search", func=search.run, description="web search")]

agent = initialize_agent(tools, llm, agent="zero-shot-react-description", verbose=True)`,
    },
  ],
  'openai-agents': [
    {
      sdk: 'openai-agents',
      source: 'quickstart.md',
      content: `from agents import Agent, function_tool

@function_tool
def get_weather(city: str) -> str:
    return f"The weather in {city} is sunny."

agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant.",
    tools=[get_weather]
)

result = agent.run("What's the weather in Tokyo?")`,
    },
    {
      sdk: 'openai-agents',
      source: 'streaming.md',
      content: `from agents import Agent

agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant."
)

# Streaming response
response = agent.run("Write a story about a robot", stream=True)
for event in response:
    if event.type == "text_created":
        print(event.text, end="", flush=True)`,
    },
    {
      sdk: 'openai-agents',
      source: 'handoffs.md',
      content: `from agents import Agent, function_tool

transfer_agent = Agent(
    name="Transfer",
    instructions="Transfer the user to the appropriate department."
)

sales_agent = Agent(
    name="Sales",
    instructions="You are a sales representative."
)

triage = Agent(
    name="Triage",
    instructions="Determine which agent can best help.",
    handoffs=[sales_agent, transfer_agent]
)`,
    },
    {
      sdk: 'openai-agents',
      source: 'guardrails.md',
      content: `from agents import Agent, GuardrailFunctionOutput
from pydantic import BaseModel

class SafetyOutput(BaseModel):
    is_safe: bool
    reason: str

def content_safety(context: AgentContext) -> GuardrailFunctionOutput:
    user_input = context.messages[-1].content
    is_safe = "harmful" not in user_input.lower()
    return GuardrailFunctionOutput(
        output_info=SafetyOutput(is_safe=is_safe, reason="Checked for harmful content"),
        tripwire_triggered=not is_safe
    )`,
    },
    {
      sdk: 'openai-agents',
      source: 'tracing.md',
      content: `from agents import Agent
from openai import OpenAI

OpenAI().tracking.enable()

agent = Agent(
    name="Assistant",
    instructions="You are a helpful assistant."
)

# All runs are automatically traced
result = agent.run("Hello!")`,
    },
  ],
  'crewai': [
    {
      sdk: 'crewai',
      source: 'core-concepts/agents.md',
      content: `from crewai import Agent
from crewai_tools import SerperDevTool, DirectoryReadTool

researcher = Agent(
    role="Researcher",
    goal="Research AI trends and provide insights",
    backstory="Expert AI researcher with 10 years of experience",
    tools=[SerperDevTool()]
)`,
    },
    {
      sdk: 'crewai',
      source: 'core-concepts/tasks.md',
      content: `from crewai import Task

research_task = Task(
    description="Research the latest AI developments",
    expected_output="A comprehensive report on AI trends",
    agent=researcher
)`,
    },
    {
      sdk: 'crewai',
      source: 'core-concepts/crew.md',
      content: `from crewai import Crew, Process

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    process=Process.hierarchical,
    manager_agent=manager
)

result = crew.kickoff()`,
    },
    {
      sdk: 'crewai',
      source: 'use-cases/investment-research.md',
      content: `from crewai import Agent, Crew, Process, Task
from crewai_tools import SerperDevTool, WebsiteSearchTool

researcher = Agent(
    role="Investment Researcher",
    goal="Find the most relevant investment opportunities",
    tools=[SerperDevTool(), WebsiteSearchTool()]
)

crew = Crew(
    agents=[researcher],
    tasks=[research_task],
    process=Process.hierarchical
)`,
    },
    {
      sdk: 'crewai',
      source: 'tutorials/customer-service.md',
      content: `from crewai import Agent, Crew, Task

support_agent = Agent(
    role="Customer Support",
    goal="Resolve customer issues efficiently",
    backstory="Experienced support agent specializing in technical issues"
)

crew = Crew(
    agents=[support_agent],
    tasks=[support_task]
)`,
    },
  ],
  'adk': [
    {
      sdk: 'adk',
      source: 'agents.md',
      content: `from google.adk.agents import Agent
from google.adk.tools import google_search

root_agent = Agent(
    name="assistant",
    model="gemini-2.0-flash",
    description="Helpful assistant agent",
    tools=[google_search]
)`,
    },
    {
      sdk: 'adk',
      source: 'tools.md',
      content: `from google.adk.tools import FunctionDeclaration
from google.adk.tools import GoogleSearch

# Define a custom tool
def get_weather(city: str) -> str:
    return f"The weather in {city} is sunny."

weather_tool = FunctionDeclaration(
    name="get_weather",
    description="Get weather for a city",
    parameters={"city": {"type": "string"}}
)`,
    },
    {
      sdk: 'adk',
      source: 'sessions.md',
      content: `from google.adk.sessions import SessionService

session_service = SessionService()
session = session_service.create_session(
    user_id="user123",
    state={"preference": "technical"}
)`,
    },
    {
      sdk: 'adk',
      source: 'runners.md',
      content: `from google.adk.runners import Runner
from google.adk.agent import RootAgent

runner = Runner(
    agent=root_agent,
    app_name="my_agent_app",
    user_id="user123"
)

response = runner.run(user_input="Hello!")
print(response.text)`,
    },
    {
      sdk: 'adk',
      source: 'memory.md',
      content: `from google.adk.memory import Memory

memory = Memory()
memory.add("User prefers concise responses")
context = memory.get_relevant("response style")`,
    },
  ],
};

class SDKIndexer {
  private qdrantUrl: string;
  private qdrantKey: string;
  
  constructor() {
    this.qdrantUrl = process.env.QDRANT_URL || 'https://f16aefe8-7f69-4c8a-9d3d-9f3e9b5b5c5b.cloud.qdrant.io';
    this.qdrantKey = process.env.QDRANT_API_KEY || '';
  }
  
  /**
   * Get embedding from Ollama (local, unlimited, private)
   */
  private async getEmbedding(text: string): Promise<number[]> {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json() as { embedding: number[] };
    return data.embedding;
  }
  
  /**
   * Index a document into Qdrant
   */
  private async indexDoc(doc: SDKDoc): Promise<boolean> {
    try {
      const embedding = await this.getEmbedding(doc.content);
      const id = randomUUID();
      
      const response = await fetch(`${this.qdrantUrl}/collections/code-docs/points`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.qdrantKey,
        },
        body: JSON.stringify({
          points: [{
            id,
            vector: embedding,
            payload: { content: doc.content, sdk: doc.sdk, source: doc.source }
          }]
        }),
      });
      
      return response.ok;
    } catch (error) {
      console.error(`   ❌ Index error:`, error);
      return false;
    }
  }
  
  /**
   * Create collection if not exists
   */
  async createCollection(): Promise<void> {
    console.log('Setting up Qdrant collection (768 dims for nomic-embed-text)...');
    
    // Delete existing collection to recreate with correct dimensions
    await fetch(`${this.qdrantUrl}/collections/code-docs`, {
      method: 'DELETE',
      headers: { 'api-key': this.qdrantKey },
    });
    
    // Create collection with 768 dimensions (nomic-embed-text)
    const createResponse = await fetch(`${this.qdrantUrl}/collections/code-docs`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.qdrantKey,
      },
      body: JSON.stringify({
        vectors: {
          size: 768,
          distance: 'Cosine'
        }
      }),
    });
    
    if (createResponse.ok) {
      console.log('   ✅ Collection created with 768 dims (nomic-embed-text)\n');
    } else {
      console.error('   ❌ Failed to create collection');
    }
  }
  
  /**
   * Index all SDKs with rate limiting
   */
  async indexAll(): Promise<{ indexed: number; failed: number }> {
    console.log('╔══════════════════════════════╗');
    console.log('║   SDK Documentation Indexer   ║');
    console.log('╚══════════════════════════════╝\n');
    
    await this.createCollection();
    
    let totalIndexed = 0;
    let totalFailed = 0;
    
    for (const [sdk, docs] of Object.entries(SDK_DOCS)) {
      console.log(`📚 Indexing ${sdk} (${docs.length} docs)...`);
      
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        
        // Ollama has no rate limit, but add small delay for stability
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const success = await this.indexDoc(doc);
        
        if (success) {
          totalIndexed++;
          process.stdout.write(`   ✅ [${i + 1}/${docs.length}] ${doc.source}\n`);
        } else {
          totalFailed++;
          process.stdout.write(`   ❌ [${i + 1}/${docs.length}] ${doc.source}\n`);
        }
      }
      
      console.log('');
    }
    
    return { indexed: totalIndexed, failed: totalFailed };
  }
  
  /**
   * Get index statistics
   */
  async getStats(): Promise<void> {
    const response = await fetch(`${this.qdrantUrl}/collections/code-docs`, {
      method: 'GET',
      headers: { 'api-key': this.qdrantKey },
    });
    
    if (!response.ok) {
      console.log('❌ Failed to get stats');
      return;
    }
    
    const data = await response.json();
    console.log('\n📊 Qdrant Collection Stats:');
    console.log(`   Points: ${data.result.points_count}`);
    console.log(`   Status: ${data.result.status}`);
  }
}

async function main() {
  const indexer = new SDKIndexer();
  
  // Run indexing
  const result = await indexer.indexAll();
  
  console.log('\n╔══════════════════════════════╗');
  console.log('║      Indexing Complete       ║');
  console.log('╚══════════════════════════════╝');
  console.log(`   ✅ Indexed: ${result.indexed}`);
  console.log(`   ❌ Failed: ${result.failed}`);
  
  // Show stats
  await indexer.getStats();
  
  console.log('\n✅ Ollama SDK Indexer Complete!');
  console.log('   - Embeddings: Ollama (nomic-embed-text)');
  console.log('   - Vector DB: Qdrant Cloud');
  console.log('   - Zero API costs');
  console.log('   - Unlimited RPM\n');
}

main().catch(console.error);
