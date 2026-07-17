# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] - 2026-07-17 14:52:22 (GMT+5:30)

### Added
- Integrated JWT authentication and user session control.
- Created Mongoose `User` schema (`/backend/src/models/User.ts`) storing usernames, bcrypt-hashed passwords, and AES-256 encrypted LLM API keys.
- Implemented `/backend/src/utils/crypto.ts` helper performing AES-256-CBC cipher encryption/decryption of keys with randomized initialization vectors (IVs).
- Implemented auth routes in `/backend/src/routes/auth.ts` for account registration, login verification, and API key updates.
- Created `/backend/src/middleware/auth.ts` JWT validation middleware.
- Implemented rate limiting in `/backend/src/middleware/rateLimiter.ts` using `express-rate-limit`:
  - Global limiter: 100 requests per 15 minutes per IP address.
  - Job runner limiter: 10 enqueued executions per 1 hour per user.
- Updated `backend/src/server.ts` to mount security middlewares, globally rate-limit incoming queries, register authentication routers, and secure API route prefixes.
- Updated `backend/src/services/llmService.ts` to decrypt and utilize user-specific custom credentials from MongoDB if configured, falling back to system defaults.

## [0.6.0] - 2026-07-17 14:35:00 (GMT+5:30)

### Added
- Created `/backend/src/data/templates.ts` database storing 3 pre-built prompt templates (AI Receptionist, Testimonial Collector, and Document Q&A) with comments on prompt engineering decisions.
- Created `/backend/src/routes/templates.ts` templates route exposing `GET /api/templates`.
- Added optional `webhookUrl` property to Mongoose schema in `/backend/src/models/AgentJob.ts`.
- Integrated background POST request notifications in `/backend/src/workers/agentWorker.ts` to push batch run outputs to `webhookUrl` on job completion.
- Implemented `/api/jobs/:id/export` route inside `/backend/src/routes/jobs.ts` to export results as JSON or CSV download attachment formats.
- Developed `/frontend/src/pages/Templates.tsx` templates catalog page with a "Use This Template" form modal pre-filling action.
- Configured `/frontend/src/pages/Agents.tsx` and `/frontend/src/app/page.tsx` parent tab managers to pre-fill the agent creation modal with template system prompts and model defaults.
- Added CSV and JSON export download links inside completed Job Cards in `/frontend/src/pages/Jobs.tsx`.

## [0.5.0] - 2026-07-17 14:25:00 (GMT+5:30)

### Added
- Integrated Socket.io real-time event communication channel to stream background execution state changes.
- Implemented `/backend/src/services/socketService.ts` Socket.io manager, using dedicated rooms matching `job:${jobId}` namespaces.
- Updated Mongoose `AgentJob` schema to support `'paused'` execution state flags.
- Configured `/backend/src/workers/agentWorker.ts` process worker to broadcast socket notifications (`job:progress`, `job:completed`, `job:failed`) and check database states mid-flight for pause/cancel signals.
- Added API endpoints in `/backend/src/routes/jobs.ts` for listing active/pending jobs and triggering control states (`pause`, `resume`, `cancel`, `retry`).
- Created `/frontend/src/hooks/useJobSocket.ts` custom React socket hook to keep UI components synced.
- Built a premium dashboard UI in `/frontend/src/pages/Jobs.tsx` featuring active progress animations, dynamic queue positions, expandable result lists, error tracking, and interactive task controls.

## [0.4.0] - 2026-07-17 14:16:00 (GMT+5:30)

### Added
- Integrated BullMQ for background batch task processing for agents.
- Implemented `/backend/src/queues/agentQueue.ts` setting up BullMQ Queue and Redis connections.
- Implemented `/backend/src/workers/agentWorker.ts` worker to process batch query runs in the background.
- Created `/backend/src/models/AgentJob.ts` Mongoose schema to track status, inputs, results, and progress of batch execution tasks.
- Created `/backend/src/routes/jobs.ts` endpoint `GET /api/jobs/:id` for polling execution status and results.
- Added `POST /api/agents/:id/run` batch trigger route to `/backend/src/routes/agents.ts`.
- Registered job routing and background workers inside Express server initialization in `backend/src/server.ts`.

## [0.3.0] - 2026-07-15 16:47:20 (GMT+5:30)

### Added
- Integrated OpenAI and Claude APIs for agent chat testing.
- Created `/backend/src/services/llmService.ts` containing the core LLM execution, dynamic routing, cost limits, and rate limit exception catches.
- Added `/backend/src/models/ChatMessage.ts` Mongoose schema to persist full dialogue transcripts in MongoDB.
- Created Express endpoints in `/backend/src/routes/chat.ts` for:
  - `POST /api/agents/:id/chat`: Query context history, dispatch LLM call, and log user + agent responses.
  - `GET /api/agents/:id/chat`: Retrieve full message history chronologically.
- Registered `/api/agents` chat routes inside `backend/src/server.ts`.
- Developed `/frontend/src/pages/AgentChat.tsx` interface featuring chat bubble layouts, send controls, typing indicators, and local mock-mode overrides.
- Integrated the interactive Chat window inside the Agents Directory.

## [0.2.0] - 2026-07-15 16:32:55 (GMT+5:30)

### Added
- Mongoose MongoDB database schema for AI Agents (`/backend/src/models/Agent.ts`) with custom field descriptions and validations.
- Express CRUD routes for AI Agents (`/backend/src/routes/agents.ts`):
  - `GET /api/agents` to list all agents sorted by date.
  - `POST /api/agents` to create a new agent with model validations.
  - `GET /api/agents/:id` to retrieve details of a specific agent.
  - `PUT /api/agents/:id` to update configurations.
  - `DELETE /api/agents/:id` to delete an agent.
- Integrated the Agent CRUD router under the `/api/agents` middleware prefix in `backend/src/server.ts`.
- Form-driven interactive AI Agent creation modal and cards list layout in `/frontend/src/pages/Agents.tsx`.
- Integrated `AgentsPage` into the primary layout of `frontend/src/app/page.tsx`.

## [0.1.0] - 2026-07-14 13:33:33 (GMT+5:30)

### Added
- Monorepo structure using NPM Workspaces:
  - `/frontend`: Next.js 14 + Tailwind CSS + TypeScript dashboard app.
  - `/backend`: Express + TypeScript server shell.
  - `/shared`: Shared TypeScript type models for Agents, Jobs, Templates, and System Settings.
- Database & Cache config:
  - Integrated `mongoose` MongoDB client and connection status verification.
  - Integrated `ioredis` Redis client, error listeners, and ping test.
- Server API:
  - Created root-level route and `GET /health` service verification endpoint.
- Web UI Client:
  - Sidebar layout navigation including: Dashboard, Agents, Jobs, Templates, Settings.
  - Real-time frontend status indicator polling backend health `/health` API.
  - Premium dark UI design system using slate theme tokens and gradients.
- Documentation:
  - Root `README.md`, `CHANGELOG.md`, `WALKTHROUGH.md`, and `SCREENTOUR.md`.
