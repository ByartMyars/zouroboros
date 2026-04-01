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
  
  // ==================== NEW SDKs ====================
  
  'llamaindex': [
    {
      sdk: 'llamaindex',
      source: 'quickstart.md',
      content: `from llama_index.core import VectorStoreIndex, SimpleDirectoryReader, Settings
from llama_index.embeddings.huggingface import HuggingFaceEmbedding

# Configure embedding model
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-small-en-v1.5")

# Load documents
documents = SimpleDirectoryReader("./data").load_data()

# Create index and query
index = VectorStoreIndex.from_documents(documents)
query_engine = index.as_query_engine()
response = query_engine.query("What are the main topics?")
print(response)`,
    },
    {
      sdk: 'llamaindex',
      source: 'loaders.md',
      content: `from llama_index.core import SimpleDirectoryReader
from llama_index.readers.web import SimpleWebPageReader
from llama_index.readers.file import PDFReader

# Directory loader
reader = SimpleDirectoryReader(input_dir="./docs", recursive=True)
docs = reader.load_data()

# Web page loader
web_reader = SimpleWebPageReader(html_to_text=True)
web_docs = web_reader.load_data(urls=["https://example.com"])

# PDF loader
pdf_reader = PDFReader()
pdf_docs = pdf_reader.load_data(file=Path("./doc.pdf"))`,
    },
    {
      sdk: 'llamaindex',
      source: 'embeddings.md',
      content: `from llama_index.core import Settings
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.embeddings.ollama import OllamaEmbedding

# OpenAI embeddings
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")

# HuggingFace (local)
Settings.embed_model = HuggingFaceEmbedding(model_name="BAAI/bge-base-en-v1.5")

# Ollama (local API)
Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text")`,
    },
    {
      sdk: 'llamaindex',
      source: 'vector_stores.md',
      content: `from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.vector_stores.qdrant import QdrantVectorStore
import qdrant_client

# Qdrant setup
client = qdrant_client.QdrantClient(url="http://localhost:6333")
vector_store = QdrantVectorStore(client=client, collection_name="my_docs")

storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex.from_documents(docs, storage_context=storage_context)`,
    },
    {
      sdk: 'llamaindex',
      source: 'agents.md',
      content: `from llama_index.core.agent import ReActAgent
from llama_index.core.tools import FunctionTool

# Create tools
def multiply(a: float, b: float) -> float:
    return a * b

tool = FunctionTool.from_defaults(fn=multiply)

# Create ReAct agent
agent = ReActAgent.from_tools([tool], llm=llm, verbose=True)
response = agent.chat("What is 123 * 456?")`,
    },
  ],
  
  'pydantic-ai': [
    {
      sdk: 'pydantic-ai',
      source: 'quickstart.md',
      content: `from pydantic_ai import Agent

agent = Agent(
    'openai:gpt-4o',
    system_prompt='Be concise and helpful.'
)

result = agent.run_sync('What is the capital of France?')
print(result.data)`,
    },
    {
      sdk: 'pydantic-ai',
      source: 'tools.md',
      content: `from pydantic_ai import Agent
from pydantic_ai.tools import tool

@tool
def get_weather(city: str) -> str:
    return f"The weather in {city} is sunny."

agent = Agent(
    'openai:gpt-4o',
    tools=[get_weather]
)

result = agent.run_sync('What is the weather in Tokyo?')`,
    },
    {
      sdk: 'pydantic-ai',
      source: 'structured-output.md',
      content: `from pydantic import BaseModel
from pydantic_ai import Agent

class CityInfo(BaseModel):
    name: str
    country: str
    population: int

agent = Agent(
    'openai:gpt-4o',
    result_type=CityInfo
)

result = agent.run_sync('Tell me about Paris')
print(result.data.name)  # Paris
print(result.data.population)  # 2161000`,
    },
    {
      sdk: 'pydantic-ai',
      source: 'dependencies.md',
      content: `from dataclasses import dataclass
from pydantic_ai import Agent, RunContext

@dataclass
class UserDeps:
    user_id: int
    user_name: str

agent = Agent(
    'openai:gpt-4o',
    deps_type=UserDeps
)

@agent.tool
def get_user_name(ctx: RunContext[UserDeps]) -> str:
    return ctx.deps.user_name

deps = UserDeps(user_id=123, user_name='Alice')
result = agent.run_sync('What is my name?', deps=deps)`,
    },
    {
      sdk: 'pydantic-ai',
      source: 'streaming.md',
      content: `from pydantic_ai import Agent

agent = Agent('openai:gpt-4o')

async with agent.run_stream('Tell me a story') as result:
    async for chunk in result.stream():
        print(chunk, end='', flush=True)`,
    },
  ],
  
  'autogen': [
    {
      sdk: 'autogen',
      source: 'quickstart.md',
      content: `import autogen

# Configure LLM
config_list = [{"model": "gpt-4", "api_key": "sk-..."}]

# Create agents
assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={"config_list": config_list}
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER"
)

# Start conversation
user_proxy.initiate_chat(assistant, message="What is the Fibonacci sequence?")`,
    },
    {
      sdk: 'autogen',
      source: 'group-chat.md',
      content: `import autogen

# Create multiple agents
planner = autogen.AssistantAgent(name="planner", system_message="You are a planner.")
coder = autogen.AssistantAgent(name="coder", system_message="You are a coder.")
reviewer = autogen.AssistantAgent(name="reviewer", system_message="You review code.")

user_proxy = autogen.UserProxyAgent(name="user_proxy")

# Group chat
groupchat = autogen.GroupChat(
    agents=[user_proxy, planner, coder, reviewer],
    messages=[],
    max_round=12
)

manager = autogen.GroupChatManager(groupchat=groupchat)
user_proxy.initiate_chat(manager, message="Build a Python calculator.")`,
    },
    {
      sdk: 'autogen',
      source: 'tools.md',
      content: `from autogen import AssistantAgent, UserProxyAgent

# Define a tool
def calculator(a: float, b: float, operator: str) -> float:
    if operator == "+": return a + b
    if operator == "-": return a - b
    if operator == "*": return a * b
    if operator == "/": return a / b

# Register tool with agent
assistant = AssistantAgent(name="assistant")
user_proxy = UserProxyAgent(name="user_proxy")

user_proxy.register_function({"calculator": calculator})

assistant.llm_config = {
    "functions": [{
        "name": "calculator",
        "description": "Calculate math operations",
        "parameters": {...}
    }]
}`,
    },
    {
      sdk: 'autogen',
      source: 'code-executor.md',
      content: `from autogen import UserProxyAgent

# Local code execution
user_proxy = UserProxyAgent(
    name="user_proxy",
    code_execution_config={
        "work_dir": "coding",
        "use_docker": False,
        "last_n_messages": 3
    }
)

# The agent will automatically execute code blocks`,
    },
    {
      sdk: 'autogen',
      source: 'nested-chats.md',
      content: `from autogen import ConversableAgent

# Create problem solver
problem_solver = ConversableAgent(
    name="problem_solver",
    system_message="You solve problems step by step."
)

# Nested chat configuration
nested_chat_config = {
    "carryover": True,
    "summary_method": "reflection_with_llm"
}

# Initiate nested chat
result = problem_solver.initiate_chat(
    recipient=critic,
    message="Solve: What is 2+2?",
    **nested_chat_config
)`,
    },
  ],
  
  'dspy': [
    {
      sdk: 'dspy',
      source: 'quickstart.md',
      content: `import dspy

# Configure LLM
lm = dspy.LM('openai/gpt-4o')
dspy.configure(lm=lm)

# Define a simple module
class Greeting(dspy.Module):
    def __init__(self):
        self.generate = dspy.Predict('name -> greeting')
    
    def forward(self, name):
        return self.generate(name=name)

# Use it
greet = Greeting()
result = greet(name="Alice")
print(result.greeting)`,
    },
    {
      sdk: 'dspy',
      source: 'signatures.md',
      content: `import dspy

# Inline signature
qa = dspy.Predict('question -> answer')
result = qa(question="What is the capital of France?")

# Class-based signature
class Summarize(dspy.Signature):
    document = dspy.InputField(desc="A long document to summarize")
    summary = dspy.OutputField(desc="A concise 1-paragraph summary")

summarizer = dspy.Predict(Summarize)
result = summarizer(document="Long text here...")`,
    },
    {
      sdk: 'dspy',
      source: 'optimizers.md',
      content: `import dspy
from dspy.teleprompt import BootstrapFewShot, MIPRO

# BootstrapFewShot optimizer
optimizer = BootstrapFewShot(
    metric=lambda example, pred, trace: example.answer == pred.answer,
    max_bootstrapped_demos=4
)

optimized_program = optimizer.compile(program, trainset=trainset)

# MIPROv2 optimizer
mipro_optimizer = MIPRO(
    metric=your_metric,
    num_candidates=10
)
optimized = mipro_optimizer.compile(program, trainset=trainset, num_trials=30)`,
    },
    {
      sdk: 'dspy',
      source: 'retrieval.md',
      content: `import dspy
from dspy.retrieve.chromadb_rm import ChromadbRM

# Set up retriever
retriever = ChromadbRM(
    collection_name='my_docs',
    persist_directory='./chroma_db'
)
dspy.configure(rm=retriever)

# RAG module
class RAG(dspy.Module):
    def __init__(self):
        self.retrieve = dspy.Retrieve(k=3)
        self.generate = dspy.ChainOfThought('context, question -> answer')
    
    def forward(self, question):
        context = self.retrieve(question).passages
        return self.generate(context=context, question=question)`,
    },
    {
      sdk: 'dspy',
      source: 'evaluation.md',
      content: `import dspy
from dspy.evaluate import Evaluate

# Define metric
def exact_match(example, pred, trace=None):
    return example.answer.lower() == pred.answer.lower()

# Create evaluator
evaluator = Evaluate(
    devset=devset,
    metric=exact_match,
    num_threads=4,
    display_progress=True
)

# Run evaluation
score = evaluator(program)
print(f"Accuracy: {score * 100:.1f}%")`,
    },
  ],
  
  'instructor': [
    {
      sdk: 'instructor',
      source: 'quickstart.md',
      content: `import instructor
from openai import OpenAI
from pydantic import BaseModel

# Patch the client
client = instructor.from_openai(OpenAI())

# Define schema
class User(BaseModel):
    name: str
    age: int

# Extract structured data
user = client.chat.completions.create(
    model="gpt-4o",
    response_model=User,
    messages=[{"role": "user", "content": "John is 25 years old"}]
)

print(user.name)  # John
print(user.age)   # 25`,
    },
    {
      sdk: 'instructor',
      source: 'validation.md',
      content: `from pydantic import BaseModel, field_validator
import instructor

class User(BaseModel):
    name: str
    age: int
    
    @field_validator('age')
    @classmethod
    def validate_age(cls, v):
        if v < 0 or v > 150:
            raise ValueError('Age must be between 0 and 150')
        return v

# Instructor automatically retries on validation failure
user = client.chat.completions.create(
    model="gpt-4o",
    response_model=User,
    messages=[{"role": "user", "content": "Alice is -5 years old"}],
    max_retries=3
)`,
    },
    {
      sdk: 'instructor',
      source: 'partial.md',
      content: `from pydantic import BaseModel
import instructor

class Article(BaseModel):
    title: str
    content: str

# Stream partial models
for article in client.chat.completions.create_partial(
    model="gpt-4o",
    response_model=Article,
    messages=[{"role": "user", "content": "Write an article about AI"}],
    stream=True
):
    print(f"Title: {article.title}")
    print(f"Content: {article.content}")`,
    },
    {
      sdk: 'instructor',
      source: 'retry.md',
      content: `from tenacity import Retrying, stop_after_attempt, wait_fixed
import instructor

# Custom retry logic
response = client.chat.completions.create(
    model="gpt-4o",
    response_model=User,
    messages=[{"role": "user", "content": "Extract user info"}],
    max_retries=Retrying(
        stop=stop_after_attempt(5),
        wait=wait_fixed(1)
    )
)`,
    },
    {
      sdk: 'instructor',
      source: 'multimodal.md',
      content: `from pydantic import BaseModel
import instructor

class ImageDescription(BaseModel):
    objects: list[str]
    mood: str
    colors: list[str]

# Analyze image with structured output
description = client.chat.completions.create(
    model="gpt-4o",
    response_model=ImageDescription,
    messages=[{
        "role": "user",
        "content": [
            {"type": "text", "text": "Describe this image"},
            {"type": "image_url", "image_url": {"url": "https://..."}}
        ]
    }]
)`,
    },
  ],
  
  'langgraph': [
    {
      sdk: 'langgraph',
      source: 'quickstart.md',
      content: `from langgraph.graph import StateGraph, END
from typing import TypedDict

# Define state
class State(TypedDict):
    input: str
    output: str

# Define nodes
def node_a(state: State):
    return {"output": state["input"] + " processed"}

# Build graph
builder = StateGraph(State)
builder.add_node("node_a", node_a)
builder.set_entry_point("node_a")
builder.add_edge("node_a", END)

# Compile and run
graph = builder.compile()
result = graph.invoke({"input": "hello"})
print(result["output"])  # hello processed`,
    },
    {
      sdk: 'langgraph',
      source: 'nodes-edges.md',
      content: `from langgraph.graph import StateGraph

builder = StateGraph(State)

# Add multiple nodes
builder.add_node("agent", agent_node)
builder.add_node("tool", tool_node)
builder.add_node("review", review_node)

# Entry point
builder.set_entry_point("agent")

# Conditional edges
def route(state):
    if state["needs_tool"]:
        return "tool"
    return END

builder.add_conditional_edges("agent", route)
builder.add_edge("tool", "agent")
builder.add_edge("review", END)`,
    },
    {
      sdk: 'langgraph',
      source: 'state.md',
      content: `from langgraph.graph import StateGraph
from typing import TypedDict, Annotated
import operator

# State with reducers
class State(TypedDict):
    messages: Annotated[list, operator.add]
    count: int

def agent(state: State):
    return {
        "messages": [{"role": "assistant", "content": "Hello"}],
        "count": state["count"] + 1
    }

# Reducers handle state merging automatically`,
    },
    {
      sdk: 'langgraph',
      source: 'memory.md',
      content: `from langgraph.graph import StateGraph
from langgraph.checkpoint.memory import MemorySaver

# Add memory/checkpointer
memory = MemorySaver()

builder = StateGraph(State)
builder.add_node("agent", agent_node)
builder.set_entry_point("agent")

graph = builder.compile(checkpointer=memory)

# Run with thread_id for persistence
config = {"configurable": {"thread_id": "thread-1"}}
result = graph.invoke({"input": "hello"}, config=config)

# Resume later with same thread_id
result2 = graph.invoke(None, config=config)  # Continue from checkpoint`,
    },
    {
      sdk: 'langgraph',
      source: 'human-in-loop.md',
      content: `from langgraph.graph import StateGraph
from langgraph.types import interrupt

builder = StateGraph(State)

def agent_with_human_approval(state: State):
    # Do work
    result = process(state)
    
    # Interrupt for human approval
    approval = interrupt({
        "question": "Approve this action?",
        "data": result
    })
    
    if approval == "yes":
        return {"output": result}
    return {"output": "rejected"}

builder.add_node("agent", agent_with_human_approval)
graph = builder.compile()

# After interrupt, resume with Command
from langgraph.types import Command
graph.invoke(Command(resume="yes"), config=config)`,
    },
  ],
  
  'semantic-kernel': [
    {
      sdk: 'semantic-kernel',
      source: 'quickstart.md',
      content: `import semantic_kernel as sk
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion

# Create kernel
kernel = sk.Kernel()

# Add chat service
kernel.add_service(OpenAIChatCompletion(service_id="gpt-4", ai_model_id="gpt-4o"))

# Create function from prompt
prompt = "{{$input}}\n\nSummarize the above in 3 bullet points."
summarize = kernel.add_function(prompt=prompt, function_name="summarize")

# Invoke
result = await kernel.invoke(summarize, input="Long text here...")
print(result)`,
    },
    {
      sdk: 'semantic-kernel',
      source: 'plugins.md',
      content: `import semantic_kernel as sk
from semantic_kernel.functions import kernel_function

class WeatherPlugin:
    @kernel_function(name="get_weather", description="Get weather for a city")
    def get_weather(self, city: str) -> str:
        return f"The weather in {city} is sunny."

# Register plugin
kernel.add_plugin(WeatherPlugin(), plugin_name="weather")

# Invoke function
result = await kernel.invoke(
    plugin_name="weather",
    function_name="get_weather",
    city="Seattle"
)`,
    },
    {
      sdk: 'semantic-kernel',
      source: 'planners.md',
      content: `from semantic_kernel.planning import BasicPlanner, FunctionCallingStepwisePlanner

# Basic planner
planner = BasicPlanner()
plan = await planner.create_plan(
    goal="Write a poem about nature and then translate it to French",
    kernel=kernel
)
result = await planner.execute_plan(plan, kernel)

# Stepwise planner
planner = FunctionCallingStepwisePlanner(service_id="gpt-4")
result = await planner.invoke(kernel, goal="Calculate the fibonacci sequence")`,
    },
    {
      sdk: 'semantic-kernel',
      source: 'memory.md',
      content: `import semantic_kernel as sk
from semantic_kernel.memory import SemanticTextMemory
from semantic_kernel.connectors.memory.qdrant import QdrantMemoryStore

# Qdrant memory
memory_store = QdrantMemoryStore(vector_size=1536, url="http://localhost:6333")
memory = SemanticTextMemory(storage=memory_store, embeddings_generator=embedding_service)

# Save and retrieve
await memory.save_information("facts", id="fact1", text="The sky is blue")
results = await memory.search("facts", "What color is the sky?", limit=1)`,
    },
    {
      sdk: 'semantic-kernel',
      source: 'agents.md',
      content: `from semantic_kernel.agents import ChatCompletionAgent
from semantic_kernel.connectors.ai.open_ai import OpenAIChatCompletion

# Create agent
agent = ChatCompletionAgent(
    kernel=kernel,
    name="Assistant",
    instructions="You are a helpful assistant."
)

# Chat with agent
from semantic_kernel.contents import ChatHistory
history = ChatHistory()
history.add_user_message("What is the capital of France?")

async for response in agent.invoke(history):
    print(response.content)`,
    },
  ],
  
  'hono': [
    {
      sdk: 'hono',
      source: 'quickstart.md',
      content: `import { Hono } from 'hono'

const app = new Hono()

// Basic routes
app.get('/', (c) => c.text('Hello Hono!'))
app.post('/users', (c) => c.json({ created: true }))
app.get('/users/:id', (c) => {
  const id = c.req.param('id')
  return c.json({ id })
})

// Start server
export default {
  port: 3000,
  fetch: app.fetch
}`,
    },
    {
      sdk: 'hono',
      source: 'middleware.md',
      content: `import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { poweredBy } from 'hono/powered-by'
import { cors } from 'hono/cors'

const app = new Hono()

// Built-in middleware
app.use(logger())
app.use(poweredBy())
app.use(cors())

// Custom middleware
app.use(async (c, next) => {
  console.log('Request:', c.req.method, c.req.url)
  await next()
  console.log('Response:', c.res.status)
})

app.get('/', (c) => c.text('Hello'))`,
    },
    {
      sdk: 'hono',
      source: 'validation.md',
      content: `import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const app = new Hono()

const schema = z.object({
  name: z.string().min(1),
  age: z.number().min(0).max(150)
})

app.post('/users', zValidator('json', schema), (c) => {
  const data = c.req.valid('json')
  return c.json({ created: data })
})

// Type-safe validation
app.post('/posts', zValidator('json', z.object({
  title: z.string(),
  content: z.string()
})), (c) => {
  const post = c.req.valid('json')
  return c.json(post)
})`,
    },
    {
      sdk: 'hono',
      source: 'streaming.md',
      content: `import { Hono } from 'hono'
import { streamText } from 'hono/streaming'

const app = new Hono()

// SSE streaming
app.get('/sse', (c) => {
  return streamText(c, async (stream) => {
    for (let i = 0; i < 10; i++) {
      await stream.write(\`data: Message \${i}\\n\\n\`)
      await stream.sleep(1000)
    }
  })
})

// JSON streaming
app.get('/stream', (c) => {
  return streamText(c, async (stream) => {
    await stream.write(JSON.stringify({ chunk: 1 }))
    await stream.write(JSON.stringify({ chunk: 2 }))
  })
})`,
    },
    {
      sdk: 'hono',
      source: 'hono-jsx.md',
      content: `/** @jsx jsx */
import { jsx } from 'hono/jsx'
import { Hono } from 'hono'

const app = new Hono()

// JSX templating
const Layout = (props: { children: any }) => (
  <html>
    <body>{props.children}</body>
  </html>
)

app.get('/', (c) => {
  return c.html(
    <Layout>
      <h1>Hello from Hono JSX!</h1>
      <p>Server-side rendered</p>
    </Layout>
  )
})`,
    },
  ],
  
  'mcp-sdk': [
    {
      sdk: 'mcp-sdk',
      source: 'server-quickstart.md',
      content: `from mcp.server import Server
from mcp.types import Tool, TextContent

# Create server
server = Server("my-server")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="calculate",
            description="Perform calculation",
            inputSchema={"type": "object", "properties": {"a": {"type": "number"}}}
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "calculate":
        result = arguments["a"] * 2
        return [TextContent(type="text", text=str(result))]

# Run server
from mcp.server.stdio import stdio_server
async with stdio_server(server) as streams:
    await server.run(streams)`,
    },
    {
      sdk: 'mcp-sdk',
      source: 'resources.md',
      content: `from mcp.server import Server
from mcp.types import Resource

server = Server("my-server")

@server.list_resources()
async def list_resources():
    return [
        Resource(
            uri="file:///data.txt",
            name="Data File",
            mimeType="text/plain"
        )
    ]

@server.read_resource()
async def read_resource(uri: str):
    if uri == "file:///data.txt":
        return "Hello from resource!"
    raise ValueError("Unknown resource")`,
    },
    {
      sdk: 'mcp-sdk',
      source: 'prompts.md',
      content: `from mcp.server import Server
from mcp.types import Prompt, PromptMessage, TextContent

server = Server("my-server")

@server.list_prompts()
async def list_prompts():
    return [
        Prompt(
            name="analyze-code",
            description="Analyze code for issues",
            arguments=[{"name": "code", "description": "Code to analyze", "required": True}]
        )
    ]

@server.get_prompt()
async def get_prompt(name: str, arguments: dict):
    if name == "analyze-code":
        return {
            "messages": [
                PromptMessage(
                    role="user",
                    content=TextContent(
                        type="text",
                        text=f"Analyze this code:\n\n{arguments['code']}"
                    )
                )
            ]
        }`,
    },
    {
      sdk: 'mcp-sdk',
      source: 'client.md',
      content: `from mcp import ClientSession
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client

# Connect via stdio
async with stdio_client(server_params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        
        # List and call tools
        tools = await session.list_tools()
        result = await session.call_tool("calculate", {"a": 5})
        
        # Read resources
        resources = await session.list_resources()
        content = await session.read_resource("file:///data.txt")

# Or connect via SSE
async with sse_client("http://localhost:3000/sse") as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()`,
    },
    {
      sdk: 'mcp-sdk',
      source: 'sampling.md',
      content: `from mcp.server import Server
from mcp.types import CreateMessageRequest

server = Server("my-server")

@server.create_message()
async def create_message(request: CreateMessageRequest):
    # Called when server wants to sample from client LLM
    response = await call_your_llm(
        messages=request.messages,
        model_preferences=request.modelPreferences
    )
    return {
        "role": "assistant",
        "content": {"type": "text", "text": response}
    }

# Client capability
capabilities = {"sampling": {}}  # Advertise sampling support`,
    },
  ],
  
  'qdrant': [
    {
      sdk: 'qdrant',
      source: 'quickstart.md',
      content: `from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

# Initialize client
client = QdrantClient(url="http://localhost:6333")
# Or cloud: QdrantClient(url="https://...", api_key="...")

# Create collection
client.create_collection(
    collection_name="my_collection",
    vectors_config=VectorParams(size=768, distance=Distance.COSINE)
)

# Check collection info
info = client.get_collection("my_collection")
print(f"Points: {info.points_count}")`,
    },
    {
      sdk: 'qdrant',
      source: 'points.md',
      content: `from qdrant_client.models import PointStruct

# Upsert points
client.upsert(
    collection_name="my_collection",
    points=[
        PointStruct(
            id=1,
            vector=[0.1, 0.2, 0.3, ...],  # 768 dims
            payload={"text": "document 1", "category": "tech"}
        ),
        PointStruct(id=2, vector=[...], payload={"text": "document 2"})
    ]
)

# Search
results = client.search(
    collection_name="my_collection",
    query_vector=[0.1, 0.2, ...],
    limit=5
)
for hit in results:
    print(f"{hit.id}: {hit.score} - {hit.payload['text']}")`,
    },
    {
      sdk: 'qdrant',
      source: 'filtering.md',
      content: `from qdrant_client.models import Filter, FieldCondition, MatchValue

# Filtered search
results = client.search(
    collection_name="my_collection",
    query_vector=query_vector,
    query_filter=Filter(
        must=[
            FieldCondition(
                key="category",
                match=MatchValue(value="tech")
            )
        ]
    ),
    limit=10
)

# Multiple conditions
Filter(
    must=[
        FieldCondition(key="status", match=MatchValue(value="active")),
        FieldCondition(key="score", range=Range(gte=0.8))
    ],
    must_not=[
        FieldCondition(key="deleted", match=MatchValue(value=True))
    ]
)`,
    },
    {
      sdk: 'qdrant',
      source: 'collections.md',
      content: `from qdrant_client.models import Distance, VectorParams, OptimizersConfig

# Create with custom config
client.create_collection(
    collection_name="optimized",
    vectors_config=VectorParams(size=768, distance=Distance.COSINE),
    optimizers_config=OptimizersConfig(
        default_segment_number=2,
        max_segment_size=100000
    )
)

# List collections
collections = client.get_collections()
for col in collections.collections:
    print(col.name)

# Delete collection
client.delete_collection("my_collection")

# Update collection
client.update_collection(
    collection_name="my_collection",
    optimizers_config=OptimizersConfig(indexing_threshold=1000)
)`,
    },
    {
      sdk: 'qdrant',
      source: 'recommendations.md',
      content: `# Recommend based on positive/negative examples
results = client.recommend(
    collection_name="my_collection",
    positive=[1, 2, 3],  # IDs of liked items
    negative=[10, 11],   # IDs of disliked items
    limit=5
)

# With filters
results = client.recommend(
    collection_name="my_collection",
    positive=[1],
    query_filter=Filter(
        must=[FieldCondition(key="available", match=MatchValue(value=True))]
    ),
    limit=10
)`,
    },
  ],
  
  'stripe': [
    {
      sdk: 'stripe',
      source: 'quickstart.md',
      content: `import stripe

# Initialize
stripe.api_key = "sk_test_..."

# Create a charge
charge = stripe.Charge.create(
    amount=2000,  # $20.00 in cents
    currency="usd",
    source="tok_visa",  # Test token
    description="My First Test Charge"
)

# Retrieve a charge
charge = stripe.Charge.retrieve("ch_1234567890")
print(charge.status)`,
    },
    {
      sdk: 'stripe',
      source: 'customers.md',
      content: `import stripe

# Create customer
customer = stripe.Customer.create(
    email="customer@example.com",
    name="John Doe",
    description="My first customer",
    metadata={"user_id": "12345"}
)

# Update customer
stripe.Customer.modify(
    customer.id,
    name="John D. Updated"
)

# List customers
customers = stripe.Customer.list(limit=10)
for c in customers.auto_paging_iter():
    print(c.email)

# Delete customer
stripe.Customer.delete(customer.id)`,
    },
    {
      sdk: 'stripe',
      source: 'subscriptions.md',
      content: `import stripe

# Create subscription
subscription = stripe.Subscription.create(
    customer="cus_1234567890",
    items=[{"price": "price_1234567890"}],
    payment_behavior="default_incomplete",
    expand=["latest_invoice.payment_intent"]
)

# Update subscription
stripe.Subscription.modify(
    subscription.id,
    items=[{"id": subscription.items.data[0].id, "price": "new_price_id"}]
)

# Cancel subscription
stripe.Subscription.delete(subscription.id)

# List subscriptions
subscriptions = stripe.Subscription.list(customer="cus_1234567890")`,
    },
    {
      sdk: 'stripe',
      source: 'webhooks.md',
      content: `import stripe
from flask import Flask, request, jsonify

app = Flask(__name__)
endpoint_secret = "whsec_..."  # From Stripe Dashboard

@app.route('/webhook', methods=['POST'])
def webhook():
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except ValueError:
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError:
        return 'Invalid signature', 400
    
    # Handle events
    if event['type'] == 'payment_intent.succeeded':
        payment_intent = event['data']['object']
        handle_successful_payment(payment_intent)
    
    return jsonify({'status': 'success'}), 200`,
    },
    {
      sdk: 'stripe',
      source: 'checkout.md',
      content: `import stripe

# Create checkout session
session = stripe.checkout.Session.create(
    payment_method_types=['card'],
    line_items=[{
        'price_data': {
            'currency': 'usd',
            'product_data': {'name': 'T-shirt'},
            'unit_amount': 2000,
        },
        'quantity': 1,
    }],
    mode='payment',
    success_url='https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url='https://example.com/cancel',
)

# Redirect customer to session.url
# Retrieve session after completion
completed = stripe.checkout.Session.retrieve(session.id)
print(completed.payment_status)`,
    },
  ],
  
  'airtable': [
    {
      sdk: 'airtable',
      source: 'quickstart.md',
      content: `from pyairtable import Api

# Initialize
api = Api('patYourPersonalAccessToken')

# Access base and table
base = api.base('appBaseId')
table = base.table('tblTableId')

# Or shorthand
table = api.table('appBaseId', 'tblTableId')

# Get all records
records = table.all()
for record in records:
    print(record['fields']['Name'])`,
    },
    {
      sdk: 'airtable',
      source: 'records.md',
      content: `from pyairtable import Api

table = api.table('appBaseId', 'tblTableId')

# Create record
new_record = table.create({
    'Name': 'New Item',
    'Status': 'Active',
    'Count': 42
})
print(new_record['id'])  # recXXXXXXXXXXXXXX

# Retrieve record
record = table.get('recXXXXXXXXXXXXXX')

# Update record
table.update('recXXXXXXXXXXXXXX', {'Status': 'Completed'})

# Replace record (deletes unspecified fields)
table.replace('recXXXXXXXXXXXXXX', {'Name': 'Replaced'})

# Delete record
table.delete('recXXXXXXXXXXXXXX')`,
    },
    {
      sdk: 'airtable',
      source: 'select.md',
      content: `from pyairtable import Api
from pyairtable.formulas import match

table = api.table('appBaseId', 'tblTableId')

# Filter with formula
records = table.all(formula="{Status} = 'Active'")

# Using formula builder
records = table.all(formula=match({'Status': 'Active', 'Priority': 'High'}))

# Sort and limit
records = table.all(sort=['-Created Time'], max_records=10)

# Pagination
for page in table.iterate(page_size=100):
    for record in page:
        print(record['fields']['Name'])`,
    },
    {
      sdk: 'airtable',
      source: 'fields.md',
      content: `from pyairtable import Api

table = api.table('appBaseId', 'tblTableId')
record = table.get('recXXXXXXXXXXXXXX')

# Different field types
name = record['fields']['Name']  # Single line text
description = record['fields']['Description']  # Long text
status = record['fields']['Status']  # Single select
tags = record['fields']['Tags']  # Multiple select (list)
link = record['fields']['Linked Record']  # Link to another table (list of IDs)
created = record['fields']['Created Time']  # Date
attachments = record['fields']['Attachments']  # Attachments (list with url)`,
    },
    {
      sdk: 'airtable',
      source: 'webhooks.md',
      content: `# Airtable Webhooks API
import requests

# Create webhook
response = requests.post(
    'https://api.airtable.com/v0/bases/appBaseId/webhooks',
    headers={'Authorization': 'Bearer patXXX'},
    json={
        'notificationUrl': 'https://your-server.com/webhook',
        'specification': {
            'options': {
                'filters': {
                    'dataTypes': ['tableData'],
                    'recordChangeScope': 'tblTableId'
                }
            }
        }
    }
)
webhook_id = response.json()['id']

# List webhooks
response = requests.get(
    'https://api.airtable.com/v0/bases/appBaseId/webhooks',
    headers={'Authorization': 'Bearer patXXX'}
)`,
    },
  ],
  
  'bun': [
    {
      sdk: 'bun',
      source: 'quickstart.md',
      content: `// Bun HTTP server
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/') {
      return new Response('Hello from Bun!')
    }
    
    if (url.pathname === '/json') {
      return Response.json({ message: 'Hello', time: Date.now() })
    }
    
    return new Response('Not Found', { status: 404 })
  },
})

console.log('Server running on http://localhost:3000')`,
    },
    {
      sdk: 'bun',
      source: 'sqlite.md',
      content: `import { Database } from 'bun:sqlite'

// Open/create database
const db = new Database('mydb.sqlite')

// Create table
db.exec(\`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT
  )
\`)

// Insert
const insert = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)')
insert.run('Alice', 'alice@example.com')

// Query
const query = db.prepare('SELECT * FROM users WHERE name = ?')
const user = query.get('Alice')
console.log(user)

// All rows
const all = db.query('SELECT * FROM users').all()`,
    },
    {
      sdk: 'bun',
      source: 'test.md',
      content: `import { describe, it, expect } from 'bun:test'

// Bun built-in test runner
describe('Math operations', () => {
  it('should add numbers correctly', () => {
    expect(1 + 1).toBe(2)
  })
  
  it('should handle async', async () => {
    const result = await Promise.resolve(42)
    expect(result).toBe(42)
  })
})

// Run with: bun test
// Watch mode: bun test --watch
// Filter: bun test math`,
    },
    {
      sdk: 'bun',
      source: 'ffi.md',
      content: `import { dlopen, FFIType, suffix } from 'bun:ffi'

// Load shared library
const path = \`libmylib.\${suffix}\`
const lib = dlopen(path, {
  add: {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.i32
  },
  greet: {
    args: [FFIType.cstring],
    returns: FFIType.cstring
  }
})

// Call C function
const sum = lib.symbols.add(5, 3)
console.log(sum)  // 8

const greeting = lib.symbols.greet('World')
console.log(greeting)`,
    },
    {
      sdk: 'bun',
      source: 'bundler.md',
      content: `// Bun bundler
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'bun',  // or 'node', 'browser'
  format: 'esm',  // or 'cjs'
  splitting: true,
  sourcemap: 'external',
  minify: true,
  external: ['react', 'react-dom']
})

// Build with macros
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  define: {
    'process.env.API_URL': JSON.stringify('https://api.example.com')
  }
})`,
    },
  ],
  
  'drizzle-orm': [
    {
      sdk: 'drizzle-orm',
      source: 'quickstart.md',
      content: `import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import Database from 'better-sqlite3'

// Define schema
const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  age: integer('age')
})

// Connect
const sqlite = new Database('sqlite.db')
const db = drizzle(sqlite)

// Query all users
const allUsers = db.select().from(users).all()

// Insert user
db.insert(users).values({ name: 'Alice', email: 'alice@example.com' }).run()`,
    },
    {
      sdk: 'drizzle-orm',
      source: 'migrations.md',
      content: `import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'

const sqlite = new Database('sqlite.db')
const db = drizzle(sqlite)

// Run migrations
migrate(db, { migrationsFolder: './drizzle' })

// Generate migrations with CLI:
// npx drizzle-kit generate:sqlite
// npx drizzle-kit push:sqlite`,
    },
    {
      sdk: 'drizzle-orm',
      source: 'relations.md',
      content: `import { relations } from 'drizzle-orm'
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name')
})

const posts = sqliteTable('posts', {
  id: integer('id').primaryKey(),
  authorId: integer('author_id').references(() => users.id),
  title: text('title')
})

// Define relations
const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts)
}))

const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id]
  })
}))`,
    },
    {
      sdk: 'drizzle-orm',
      source: 'selects.md',
      content: `import { eq, gt, like, and, or } from 'drizzle-orm'

// Basic select
const allUsers = db.select().from(users)

// With where
const alice = db.select().from(users).where(eq(users.name, 'Alice')).get()

// Multiple conditions
const results = db.select().from(users).where(
  and(gt(users.age, 18), like(users.email, '%@example.com'))
).all()

// Select specific columns
const names = db.select({ name: users.name, email: users.email }).from(users).all()

// With join
const userPosts = db.select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .all()`,
    },
    {
      sdk: 'drizzle-orm',
      source: 'insert-update.md',
      content: `import { eq } from 'drizzle-orm'

// Insert single
db.insert(users).values({ name: 'Alice', email: 'alice@example.com' }).run()

// Insert multiple
db.insert(users).values([
  { name: 'Bob', email: 'bob@example.com' },
  { name: 'Carol', email: 'carol@example.com' }
]).run()

// Insert with returning (PostgreSQL/SQLite)
const newUser = db.insert(users)
  .values({ name: 'Dave', email: 'dave@example.com' })
  .returning({ id: users.id, name: users.name })
  .get()

// Update
db.update(users)
  .set({ name: 'Alice Updated' })
  .where(eq(users.id, 1))
  .run()

// Delete
db.delete(users).where(eq(users.id, 1)).run()`,
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
