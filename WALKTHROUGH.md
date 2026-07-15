# Walkthrough - AgentForge Platform Overview

AgentForge is designed to bridge the gap between simple chat UIs and autonomous multi-agent pipelines. It enables users to create task-specific agents, configure prompt parameters, schedule jobs, and monitor execution states in real-time.

## Platform Features

### 🚧 Planned Features
* **Custom Agent Builder**: Select LLM model parameters, temperature, system prompts, and bind tools.
* **Queued Job Execution**: Push prompt variables to BullMQ workers via API.
* **Dynamic Template Manager**: Draft, parameterize, and version reusable prompts.
* **OpenAI & Claude Runner Interfaces**: Execute prompt instructions with active LLM clients.
* **Structured Output Parsing**: Parse unstructured responses into clean JSON structures.
* **Metrics Dashboard**: Watch job latency, token consumption, and success metrics live.

---

## Planned User Workflow

The flow below displays the end-to-end user experience when orchestrating agents on the platform:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant UI as Next.js Dashboard
    participant API as Express Server
    participant Redis as Redis (BullMQ Queue)
    participant Worker as Background Worker
    participant LLM as LLM APIs (OpenAI/Claude)
    participant DB as MongoDB

    User->>UI: Configure Agent & Prompt Template
    UI->>API: Create Agent API Request
    API->>DB: Save Agent Config
    DB-->>API: Confirm Save
    API-->>UI: Agent Created successfully

    User->>UI: Input Prompt Variables & Run Job
    UI->>API: Queue Execution Request
    API->>Redis: Enqueue Job (BullMQ)
    Redis-->>API: Job Queued (Job ID)
    API-->>UI: Return Job Status (Pending)

    Worker->>Redis: Pull Pending Job
    Worker->>DB: Fetch Agent system prompt details
    DB-->>Worker: Agent Config
    Worker->>LLM: Dispatch completion payload
    LLM-->>Worker: Return completions response
    Worker->>DB: Store execution outputs & metrics
    Worker->>Redis: Mark job completed
    
    UI->>API: Poll Job State / GET /health
    API->>DB: Fetch completed job details
    DB-->>API: Job Output Data
    API-->>UI: Return completed data
    UI->>User: Display final Output & export metrics
```

---

## Core Operations Walkthrough

### Creating an Agent

Creating a new agent in AgentForge configures a persistent agent persona that can be referenced by automation tasks. Follow these steps:

1. **Access Directory**: Open the web dashboard and click on **Agents** in the sidebar. This loads the Agents grid.
2. **Launch Creator**: Click the **New Agent** button in the upper right. An overlay modal form will appear.
3. **Configure Settings**:
   - **Name**: Assign a unique name (e.g. `Doc-QA-Validator`).
   - **Orchestrator Type**: Choose the functional profile:
     - `receptionist`: Best for greeting users and extracting intent.
     - `testimonial`: Best for classifying reviews and feedback.
     - `qa`: Best for validation, integration, and UI testing.
     - `custom`: Standard freeform prompt workflows.
   - **LLM Engine**: Bind the agent either to `gpt-4o` (OpenAI) or `claude-3-5-sonnet` (Anthropic).
   - **Operational Status**: Toggle between `Active` or `Inactive` status.
   - **System Instructions**: Write the base system prompt instructions that govern the LLM behavior.
4. **Deploy**: Click **Deploy Agent**. The form sends a POST request to `/api/agents`. If successful, the modal closes and the agent card appears in the grid.

