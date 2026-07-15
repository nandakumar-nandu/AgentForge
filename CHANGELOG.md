# Changelog

All notable changes to this project will be documented in this file.

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
