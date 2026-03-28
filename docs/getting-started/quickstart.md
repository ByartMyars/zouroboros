# Quick Start Tutorial

> Build your first Zouroboros-powered project in 10 minutes

## What We'll Build

A simple project that demonstrates:
1. **Memory** - Store and retrieve facts
2. **OmniRoute** - Route tasks to optimal models
3. **Workflow** - Use spec-first development
4. **Swarm** - Run a simple multi-agent campaign

## Step 1: Initialize Your Project

```bash
# Create a new project directory
mkdir my-zouroboros-project
cd my-zouroboros-project

# Initialize Zouroboros
zouroboros init

# Verify setup
zouroboros doctor
```

Expected output:
```
✅ Core types loaded
✅ Memory system ready
✅ OmniRoute configured
✅ Workflow tools available
✅ Swarm orchestrator ready
✅ All systems healthy
```

## Step 2: Store Your First Memory

Using Zo chat:
```
Store this in memory: My favorite programming language is TypeScript
```

Or using CLI:
```bash
zouroboros memory store \
  --entity "user" \
  --key "favorite_language" \
  --value "TypeScript" \
  --decay permanent
```

Verify it was stored:
```bash
zouroboros memory search "favorite language"
```

Output:
```
🔍 Search Results (1 found)
━━━━━━━━━━━━━━━━━━━━━
📌 [[user]].favorite_language
   TypeScript
   Category: preference | Decay: permanent
```

## Step 3: Route a Task with OmniRoute

Check which model combo is best for a task:

```bash
zouroboros omniroute resolve "Build a REST API in TypeScript"
```

Output:
```json
{
  "complexity": {
    "tier": "moderate",
    "score": 0.64,
    "inferredTaskType": "coding"
  },
  "resolvedCombo": "swarm-mid"
}
```

## Step 4: Run a Spec-First Interview

Before building anything, clarify requirements:

```bash
zouroboros workflow interview \
  --topic "Build a todo list API" \
  --output ./interview-notes.md
```

This creates an interview transcript that you can review.

Generate a seed specification:

```bash
zouroboros workflow interview seed \
  --from ./interview-notes.md \
  --output ./seed.yaml
```

## Step 5: Run a Simple Swarm Campaign

Create a tasks file `campaign.json`:

```json
{
  "tasks": [
    {
      "id": "1",
      "persona": "Backend Developer",
      "task": "Design the database schema for a todo app",
      "priority": "high"
    },
    {
      "id": "2",
      "persona": "API Developer",
      "task": "Create REST endpoints for CRUD operations",
      "priority": "high",
      "dependsOn": ["1"]
    },
    {
      "id": "3",
      "persona": "Frontend Developer",
      "task": "Build a simple UI for the todo app",
      "priority": "medium",
      "dependsOn": ["2"]
    }
  ]
}
```

Run the campaign:

```bash
zouroboros swarm run \
  --tasks ./campaign.json \
  --output ./results
```

## Step 6: Check System Health

Run a health check on your Zouroboros installation:

```bash
zouroboros heal introspect --verbose
```

This generates a scorecard showing:
- Memory recall quality
- Graph connectivity
- Routing accuracy
- And more...

## What's Next?

- **[Tutorial](./tutorial.md)** - Deep dive into each component
- **[Examples](../examples/)** - Complete example projects
- **[API Reference](../reference/api.md)** - Programmatic usage

## Quick Reference

### Essential Commands

| Command | Purpose |
|---------|---------|
| `zouroboros doctor` | Check system health |
| `zouroboros memory store` | Save a fact |
| `zouroboros memory search` | Find facts |
| `zouroboros omniroute resolve` | Get optimal model |
| `zouroboros workflow interview` | Run spec-first interview |
| `zouroboros swarm run` | Execute campaign |
| `zouroboros heal introspect` | Health scorecard |
| `zouroboros tui` | Launch dashboard |

### From Zo Chat

You can use natural language with Zo:

```
Store in memory that I prefer dark mode
```

```
What's my favorite programming language?
```

```
Run a spec-first interview for building a blog
```

```
Check my Zouroboros health
```