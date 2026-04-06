---
name: spec-first-interview
description: |
  Socratic interview and seed specification generator. Use before any major build task to clarify requirements, expose hidden assumptions, and produce an immutable spec ("seed") with acceptance criteria and an ontology. Prevents wasted cycles on ambiguous work. Adapted from Q00/ouroboros.
compatibility: Created for Zo Computer
metadata:
  author: marlandoj.zo.computer
  origin: https://github.com/Q00/ouroboros
---


# Spec-First Interview

> Before telling AI what to build, define what should be built.

## When to Use

- Before any multi-step build task (new skill, service, site, agent workflow)
- When a request is vague or has implicit assumptions
- Before committing expensive LLM cycles to implementation
- When multiple personas will collaborate on a deliverable

## Quick Start

```bash
# Run the interview
bun Skills/spec-first-interview/scripts/interview.ts --topic "Build a webhook retry system"

# Generate a seed spec from interview notes
bun Skills/spec-first-interview/scripts/interview.ts seed --from /path/to/interview-notes.md

# Score ambiguity of a request
bun Skills/spec-first-interview/scripts/interview.ts score --request "Make the site faster"
```

## Workflow

### Phase 1: Socratic Interview

Adopt the **Socratic Interviewer** role (see `references/socratic-interviewer.md`).

1. **Start with the broadest ambiguity source** — ask one focused question
2. **Build on each answer** — reference earlier responses, probe inconsistencies
3. **Track three dimensions** as you go:
   - Goal clarity (weight 40%)
   - Constraint clarity (weight 30%)
   - Success criteria clarity (weight 30%)
4. **After 5–8 questions**, compute ambiguity:
   ```
   ambiguity = 1 - (goal × 0.40 + constraints × 0.30 + success × 0.30)
   ```
5. **Gate**: Interview passes when ambiguity ≤ 0.2 (80% clarity)

**Rules during interview:**
- ONLY ask questions — never promise to build, implement, or create anything
- End every response with a question
- No filler ("Great question!", "I understand")
- Use ontological probes: "What IS this?", "Root cause or symptom?", "What are we assuming?"
- If existing codebase context is available, ask confirmation questions citing specific files — not open-ended discovery

### Phase 2: Seed Generation

Once ambiguity ≤ 0.2, adopt the **Seed Architect** role (see `references/seed-architect.md`).

Extract from the interview:

| Component | Description |
|-----------|-------------|
| **Goal** | Clear, specific primary objective |
| **Constraints** | Hard limitations (pipe-separated) |
| **Acceptance Criteria** | Measurable success conditions (pipe-separated) |
| **Ontology** | Domain model — name, description, fields (name:type:description) |
| **Evaluation Principles** | Quality dimensions with weights (name:description:weight) |
| **Exit Conditions** | When to stop (name:description:criteria) |

Save the seed to the workspace as a YAML file:

```yaml
# seed-{id}.yaml
id: seed-{uuid}
created: {iso_date}
goal: "Build a CLI task management tool in Python"
constraints:
  - "Python 3.14+"
  - "No external database"
  - "Must work offline"
acceptance_criteria:
  - "Tasks can be created with title and priority"
  - "Tasks can be listed, filtered by status"
  - "Tasks persist to local JSON file"
ontology:
  name: task
  description: "A unit of work to be tracked"
  fields:
    - name: id
      type: string
      description: "Unique identifier"
    - name: title
      type: string
      description: "Human-readable task name"
    - name: status
      type: string
      description: "Current state: pending | done"
evaluation_principles:
  - name: correctness
    description: "Does it do what was asked?"
    weight: 0.4
  - name: simplicity
    description: "Is the implementation minimal?"
    weight: 0.3
  - name: usability
    description: "Is the CLI intuitive?"
    weight: 0.3
exit_conditions:
  - name: all_ac_met
    description: "All acceptance criteria satisfied"
    criteria: "AC compliance = 100%"
```

### Phase 3: Ontological Check (Optional)

For complex or high-stakes work, run the **Ontologist** lens (see `references/ontologist.md`) on the seed:

1. **Essence** — "What IS this, really?" Strip away accidental properties
2. **Root Cause** — "Is this the root problem or a symptom?"
3. **Prerequisites** — "What must exist first?"
4. **Hidden Assumptions** — "What are we assuming? What if the opposite were true?"

### Phase 4: Gap Audit (Post-Implementation)

After implementation passes post-flight eval (see `three-stage-eval` skill), run a **gap audit** before marking the work complete. This phase catches "built but not wired" failures that compile and pass tests but do nothing in production.

**Three mandatory checks:**

| Check | Question | Failure Class |
|-------|----------|---------------|
| **Reachability** | Does every new capability have a caller, trigger, or platform wiring that invokes it? | Functions/routes/handlers that exist but are never called |
| **Data Prerequisites** | Are schemas populated, pools configured, maps seeded, and bootstrap data in place? | Structure without data — tables exist but are empty, configs defined but not loaded |
| **Cross-Boundary State** | Do env vars, sentinels, or flags survive process boundaries? | State that works in tests (single process) but fails in production (separate processes) |

**Process:**
1. For each new capability introduced, trace the call chain from platform trigger → function. If no trigger exists, the capability is unreachable.
2. For each new data structure, verify it contains data — not just schema. Run a sample query.
3. For each cross-process communication mechanism, verify it works across `bun` invocations (file sentinels in `/dev/shm/`, not env vars).

**Gate:** All three checks must pass. If any fail → fix → re-run post-flight eval on affected components → re-audit. Loop until clean, then close.

**Origin:** This phase was added after the PKA Session Briefing implementation (2026-04-06), where the gap audit caught two "built but not wired" issues across two phases that would have shipped as silent production failures.

## Integration with Zo Workflows

- **Blog chain**: Run interview before the content-strategist step
- **Swarm campaigns**: Generate a seed, then decompose into campaign tasks
- **Service builds**: Interview → seed → implement → evaluate → gap audit (see `three-stage-eval` skill)
- **Persona creation**: Clarify role boundaries and responsibilities before creating identity files
- **Full pipeline**: interview → seed → eval seed → approve → execute → post-flight eval → gap audit → close
