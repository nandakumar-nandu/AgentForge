# Changelog

All notable changes to this project will be documented in this file.

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
