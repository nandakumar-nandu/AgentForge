<p align="left">
  <img src="./public/logo.webp" alt="AgentForge Logo" width="800" />
</p>

AgentForge is a full-stack, enterprise-ready orchestration and automation dashboard for autonomous AI agents. Powered by OpenAI and Claude LLMs, it integrates a robust Express API backend, MongoDB for data storage, and BullMQ + Redis for scalable, queue-driven asynchronous task execution.

<table table-layout="fixed" width="100%">
  <tr>
    <td align="center" width="33%">
      <strong>Dashboard</strong><br/>
      <img src="./public/screenshots/Dashboard.png" alt="Dashboard" />
    </td>
    <td align="center" width="33%">
      <strong>Agents</strong><br/>
      <img src="./public/screenshots/Agents.png" alt="Agents" />
    </td>
    <td align="center" width="33%">
      <strong>Templates</strong><br/>
      <img src="./public/screenshots/Templates.png" alt="Templates" />
    </td>
  </tr>
  <tr>
    <td align="center" width="33%">
      <strong>Pipelines</strong><br/>
      <img src="./public/screenshots/Pipelines.png" alt="Pipelines" />
    </td>
    <td align="center" width="33%">
      <strong>Analytics</strong><br/>
      <img src="./public/screenshots/Analytics.png" alt="Analytics" />
    </td>
    <td align="center" width="33%">
      <strong>Settings</strong><br/>
      <img src="./public/screenshots/Settings.png" alt="Settings" />
    </td>
  </tr>
</table>

> 🚀 **Live Demo**: https://www.agentforge.kpebble.com

---
## Technology Stack & Versions

![Next.js](https://img.shields.io/badge/Next.js-14.2.35-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-18-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4.5-blue?style=for-the-badge&logo=typescript)
![Express](https://img.shields.io/badge/Express-4.19.2-lightgrey?style=for-the-badge&logo=express)
![Mongoose](https://img.shields.io/badge/Mongoose-8.4.1-red?style=for-the-badge&logo=mongodb)
![Redis](https://img.shields.io/badge/Redis-5.4.1-red?style=for-the-badge&logo=redis)
![BullMQ](https://img.shields.io/badge/BullMQ-5.8.1-orange?style=for-the-badge)
![Socket.io](https://img.shields.io/badge/Socket.io-4.7.5-black?style=for-the-badge&logo=socket.io)
![Recharts](https://img.shields.io/badge/Recharts-2.12.7-blue?style=for-the-badge)
![dnd--kit](https://img.shields.io/badge/dnd--kit-6.1.0-blue?style=for-the-badge)

---

## Monorepo Project Structure

This project is organized as a workspace monorepo:
* **`/frontend`**: Next.js 14 Web UI built with React, TypeScript, and Tailwind CSS.
* **`/backend`**: Express server built with TypeScript, MongoDB (via Mongoose), and Redis (via ioredis).
* **`/shared`**: Common TypeScript schemas and interfaces shared between the frontend and backend.

---

## System Architecture

```mermaid
graph TD
    subgraph Client Space
        FE[Next.js 14 Frontend]
    end

    subgraph Service Space
        BE[Express Backend Server]
    end

    subgraph Storage & Queues
        DB[(MongoDB)]
        Cache[(Redis Cache & Queue)]
    end

    subgraph LLM Providers
        OAI[OpenAI API]
        CLD[Claude API]
    end

    FE <-->|REST API / Health| BE
    BE <-->|Mongoose Connections| DB
    BE <-->|BullMQ Jobs / States| Cache
    BE -->|Completion Requests| OAI
    BE -->|Completion Requests| CLD
```

---

## Planned Agent Workflow Pipeline

```mermaid
graph TD
    A[User/Trigger Input] --> B[Job Scaffolding & Validation]
    B --> C[Push to BullMQ Redis Queue]
    C --> D[Active Worker Pulls Job]
    D --> E[Inject Prompt Template & System Instructions]
    E --> F{Select Provider}
    F -->|OpenAI| G[Call OpenAI Chat Completions]
    F -->|Anthropic| H[Call Claude Messages API]
    G --> I[Validate & Sanitize LLM Response]
    H --> I[Validate & Sanitize LLM Response]
    I -->|Success| J[Store Output in MongoDB & Mark Completed]
    I -->|Failure / Error| K[Store Error, Auto-Retry, or Mark Failed]
    J --> L[Notify Client UI / Update Dashboard]
    K --> L
```

---

## Chat Message Flow

The sequence below illustrates the communication flow during interactive agent chat testing:

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Chat UI
    participant BE as Express Router
    participant LLM as LLM API (OpenAI/Claude)
    participant DB as MongoDB (ChatMessage Collection)

    User->>FE: Write Prompt & Click Send
    FE->>BE: POST /api/agents/:id/chat { message }
    BE->>DB: Query historical messages (ChatMessage.find)
    DB-->>BE: Returns sorted message history array
    BE->>BE: Append history & system prompts
    BE->>LLM: Dispatch completion request (temperature/cost rules)
    LLM-->>BE: Returns textual assistant response
    BE->>DB: Save User prompt (ChatMessage.save)
    BE->>DB: Save Agent reply (ChatMessage.save)
    BE-->>FE: Return reply, userMsg, and agentMsg
    FE->>User: Render message in chat bubbles list
```

---

## Batch Job Queue Flow

The diagram below shows the asynchronous lifecycle of batch execution runs enqueued to BullMQ:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / REST Tester
    participant API as Express API Router
    participant DB as MongoDB (AgentJob Collection)
    participant Redis as Redis (BullMQ Queue)
    participant Worker as BullMQ Worker
    participant LLM as LLM API (OpenAI/Claude)

    Client->>API: POST /api/agents/:id/run { inputData: [...] }
    API->>DB: Create AgentJob (status: pending, progress: 0)
    DB-->>API: Returns AgentJob tracking doc
    API->>Redis: Enqueue Job data (jobId, agentId, inputData)
    API-->>Client: Return 202 Accepted { jobId } immediately
    
    Note over Worker, Redis: Worker fetches waiting jobs from Redis
    Worker->>Redis: Pop batch-job
    Worker->>DB: Update status to 'active'
    
    loop For each query in inputData
        Worker->>LLM: Dispatch completion request
        LLM-->>Worker: Return response text
        Worker->>DB: Append result & update progress %
        Worker->>Redis: Update job progress %
    end

    Worker->>DB: Mark status 'completed' & save completedAt
    Worker->>Redis: Mark Job finished successfully
```

---

## Real-Time Socket.io Event Flow

The diagram below charts how background execution events stream from BullMQ workers to the frontend via Socket.io:

```mermaid
graph TD
    subgraph Backend Services
        Worker[BullMQ Background Worker]
        SocketServer[Socket.io Server Instance]
        RestRouter[Express REST API]
    end

    subgraph Storage Space
        MDB[(MongoDB)]
    end

    subgraph Client Application
        Hook[useJobSocket Custom React Hook]
        Dashboard[Jobs Dashboard View]
    end

    Worker -->|1. Emits job:progress, job:completed, job:failed| SocketServer
    SocketServer -->|2. Dispatches to room 'job:jobId' & broadcast| Hook
    Hook -->|3. Updates React state array| Dashboard
    Dashboard -->|4. Renders live progress bars & outputs| Dashboard
    Dashboard -->|5. Submits pause/resume/cancel/retry| RestRouter
    RestRouter -->|6. Saves new state| MDB
```

---

## Database Schema (Platform ER Diagram)

```mermaid
erDiagram
    USER {
        ObjectId id PK
        string username "required, unique"
        string password "hashed"
        string openaiKeyEncrypted "optional"
        string openaiKeyIv "optional"
        string claudeKeyEncrypted "optional"
        string claudeKeyIv "optional"
        date createdAt
    }
    AGENT {
        ObjectId id PK
        string name "required, trimmed"
        string type "enum: receptionist, testimonial, qa, custom"
        string systemPrompt "required"
        string model "enum: gpt-4o, claude-3-5-sonnet"
        string status "enum: active, inactive"
        date createdAt "default: now"
    }
    CHATMESSAGE {
        ObjectId id PK
        ObjectId agentId FK
        string sender "user|agent"
        string content "required"
        date timestamp
    }
    AGENTJOB {
        ObjectId id PK
        ObjectId agentId FK
        ObjectId userId FK
        stringArray inputData
        string status "pending|active|completed|failed|paused"
        stringArray results
        number progress
        string error "optional"
        string webhookUrl "optional"
        date createdAt
        date completedAt "optional"
    }
    USER ||--o{ AGENTJOB : enqueues
    AGENT ||--o{ CHATMESSAGE : has
    AGENT ||--o{ AGENTJOB : executes
```

---

## Live Demo Deployments

The platform can be accessed live using the following staging URLs:
- **Web UI Dashboard (Vercel)**: [https://agentforge-dashboard.vercel.app](https://agentforge-dashboard.vercel.app)
- **REST API Gateway (Railway)**: [https://agentforge-backend.up.railway.app](https://agentforge-backend.up.railway.app)


---

## Cost Tracking Flow

```mermaid
sequenceDiagram
    autonumber
    participant UI as Next.js Analytics UI
    participant API as Express API Server
    participant DB as MongoDB (UsageLogs)
    participant Worker as Worker / Chat Router
    participant LLM as LLM APIs (OpenAI/Claude)
    participant Cost as costService
    
    Note over Worker, LLM: During batch execution (or interactive chat)
    Worker->>LLM: Request completion
    LLM-->>Worker: Return text response + token usage
    Worker->>Cost: logUsage(model, tokens, agentId, userId)
    Cost->>Cost: calculateCost(model, tokens)
    Cost->>DB: Save UsageLog document
    
    Note over UI, API: Fetching analytics dashboards
    UI->>API: GET /api/analytics/overview
    API->>DB: MongoDB Aggregation (Spend, Active Agent, Costs)
    DB-->>API: Aggregate numbers
    API-->>UI: Return overview JSON payload
    UI->>UI: Render charts & grids via Recharts
```

---

## Analytics & Cost Tracking

To ensure transparency and manage API costs, AgentForge includes a request-level telemetry audit logger.

### Cost Calculation Pricing Models
Rates are configured dynamically inside the [costService.ts](file:///d:/projects/AgentForge/backend/src/services/costService.ts) and calculated per 1,000,000 tokens:

| Model | Input Tokens Rate (per 1M) | Output Tokens Rate (per 1M) |
| :--- | :--- | :--- |
| **gpt-4o** | $5.00 | $15.00 |
| **claude-3-5-sonnet** | $3.00 | $15.00 |

### Cost Calculation Formula
$$\text{Estimated Cost (USD)} = \frac{\text{Input Tokens} \times \text{Input Rate}}{1,000,000} + \frac{\text{Output Tokens} \times \text{Output Rate}}{1,000,000}$$

---

## API Documentation

The backend exposes a full REST API for managing AI Agents, batch queues, and usage analytics. All private routes require a valid JWT header (`Authorization: Bearer <token>`).

| Method | Endpoint | Description | Request Body / Params | Response Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/agents` | Retrieve all agents sorted by date (descending) | None | `200 OK`, `500 Server Error` |
| **POST** | `/api/agents` | Create a new AI Agent | `{ name, type, model, systemPrompt, status? }` | `201 Created`, `400 Bad Request`, `500 Server Error` |
| **GET** | `/api/agents/:id` | Retrieve detailed configuration of a single agent | Path Param: `:id` (Mongoose ObjectId) | `200 OK`, `400 Invalid ID`, `404 Not Found`, `500 Server Error` |
| **PUT** | `/api/agents/:id` | Update configuration parameters of an agent | Path Param: `:id`, JSON body of fields to update | `200 OK`, `400 Invalid/Validation Error`, `404 Not Found`, `500 Server Error` |
| **DELETE** | `/api/agents/:id` | Delete an agent permanently | Path Param: `:id` (Mongoose ObjectId) | `200 OK`, `400 Invalid ID`, `404 Not Found`, `500 Server Error` |
| **GET** | `/api/analytics/overview` | Fetch aggregate counts, monthly spend totals, and active agent details | None | `200 OK`, `401 Unauthorized`, `500 Server Error` |
| **GET** | `/api/analytics/agents/:id` | Fetch per-agent 30-day token and cost distribution graphs | Path Param: `:id` | `200 OK`, `401 Unauthorized`, `404 Not Found`, `500 Server Error` |
| **GET** | `/api/analytics/usage` | Fetch paginated raw telemetry logs with search filters | Query parameters: `page, limit, agentId, model, startDate, endDate` | `200 OK`, `401 Unauthorized`, `500 Server Error` |

---

## Setup & Installation

### Prerequisites
Make sure you have the following installed on your machine:
* **Node.js** (v18+ recommended)
* **NPM** (v9+ recommended)
* **MongoDB** (Running on port `27017`)
* **Redis** (Running on port `6379`)

### Redis Setup & Installation
The background batch processing feature uses BullMQ, which requires a running Redis instance to persist the job queue queues and state machines.

* **Docker Option (Recommended)**:
  Run Redis locally in a lightweight container:
  ```bash
  docker run --name agentforge-redis -p 6379:6379 -d redis:alpine
  ```
* **WSL / Linux Option**:
  Install and start the native service in Ubuntu/Debian:
  ```bash
  sudo apt update && sudo apt install redis-server -y
  sudo service redis-server start
  ```
* **macOS Option**:
  Start via Homebrew:
  ```bash
  brew install redis
  brew services start redis
  ```
* **Windows Native Option**:
  Download and run Redis for Windows (e.g. Memurai or archive releases) and ensure `redis-server` runs on its default port `6379`.

---

## Security & API Key Protection

AgentForge implements industry-standard security practices to protect client secrets and preserve API availability:

1. **Authentication (JWT)**:
   All administrative, configuration, and execution endpoints require a valid JSON Web Token (JWT) provided in the `Authorization` header (`Bearer <token>`). Tokens are signed using a server-side `JWT_SECRET` and expire after 24 hours.
2. **Encryption at Rest (AES-256-CBC)**:
   To prevent token theft from database leaks, user-configured OpenAI and Claude API keys are encrypted at rest using AES-256-CBC before saving. Decryption happens dynamically in-memory during prompt execution. The cryptographic key `ENCRYPTION_KEY` is isolated in the backend environment.
3. **Throttling & Rate Limiting**:
   - **General Routes Limiter**: Enforces a budget of 100 requests per 15 minutes per IP to block DoS attempts.
   - **Job Execution Limiter**: Restricts submissions to 10 batch jobs per hour per user account to prevent API abuse and runaway costs.

---

### 1. Installation
Clone the repository and run `npm install` in the root folder to download and link all workspace dependencies:
```bash
npm install
```

### 2. Compilation (Build)
Compile the common shared package, followed by the backend and frontend:
```bash
# Compile shared packages
npm run build:shared

# Compile backend
npm run build:backend

# Compile frontend
npm run build:frontend
```

### 3. Environment Configurations
Configure environmental variables for both `/backend` and `/frontend`. Copies of `.env.example` are available in both folders:

* **Backend Environment (`/backend/.env`)**:
  ```ini
  PORT=5001
  MONGODB_URI=mongodb://localhost:27017/agentforge
  REDIS_URL=redis://localhost:6379
  JWT_SECRET=your-super-secret-jwt-key
  ENCRYPTION_KEY=f90a6e382d547f2e1a3d5b7c8e9f0c1b
  ```

* **Frontend Environment (`/frontend/.env`)**:
  ```ini
  NEXT_PUBLIC_API_URL=http://localhost:5001
  ```

### 4. Running the Project Locally
To start the services in development mode, run:
```bash
# Run Express backend server (on port 5001)
npm run dev:backend

# Run Next.js dashboard client (on port 3000)
npm run dev:frontend
```
Once both are running, visit [http://localhost:3000](http://localhost:3000) in your browser. The frontend will show live database and Redis health signals from the API.
