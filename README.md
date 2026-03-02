# myCubeKub

Minecraft server management panel built as a Bun multi-project repo with a React frontend, an Elysia API, a shared API contract package, PostgreSQL for metadata, and per-server runtime provisioning on the host machine.

## Overview

`myCubeKub` is a self-hosted control panel for running and managing multiple Minecraft servers from a single web interface. The project focuses on practical day-to-day operations:

- create a new Minecraft server from the dashboard
- assign a dedicated public port per server
- configure server type, version, and memory
- start, stop, restart, recreate, or delete a server
- inspect live CPU and memory usage
- browse and edit server files
- stream logs and send console commands
- keep connection addresses consistent through `CONNECTION_IP`

The current UI is intentionally styled as a game-inspired control panel with a Minecraft-like visual direction, but the core value of the project is operational control over real server instances.

## Core Features

- Authentication with cookie-based sessions
- Dashboard for listing all servers and their live state
- Dedicated server detail page with:
  - status and connection information
  - settings management
  - property editor
  - file browser
  - file editor
  - live console stream
- Port uniqueness protection at both API and database levels
- Recovery flow for missing server runtime instances:
  - `Recreate`
  - `Delete`
- Shared form options and UI components between create and edit flows
- Loading overlays and clearer in-app failure states

## Product Behavior

Each managed server has:

- a database record in PostgreSQL
- a dedicated directory under `SERVERS_DIR`
- an auto-generated `docker-compose.yml`
- a `data/` directory used as the Minecraft server data volume

When you create a server, the API:

1. validates the requested port
2. inserts the server metadata into PostgreSQL
3. generates the server directory and compose file
4. starts the runtime
5. updates the cached server status

If provisioning fails after the database row is created, cleanup logic removes the generated files and orphaned record.

## Architecture

### Repo Layout

```text
.
|-- apps/
|   |-- api/   # Bun + Elysia + Drizzle + Docker integration
|   `-- web/   # React + Vite + Tailwind frontend
|-- packages/
|   `-- api-contract/   # shared Elysia App type for Eden
|-- servers/   # Generated per-server runtime directories
|-- backups/   # Reserved backup storage
`-- README.md
```

### Frontend

Location: `apps/web`

Stack:

- React 19
- Vite
- TypeScript
- Tailwind CSS
- `react-router-dom`
- `lucide-react`

Frontend responsibilities:

- login flow
- dashboard and navigation
- create/edit server forms
- status presentation
- file browser and editor
- Eden client for typed API access
- WebSocket console UI via Eden treaty
- user-facing error and loading states

### API

Location: `apps/api`

Stack:

- Bun
- Elysia
- Drizzle ORM
- PostgreSQL
- Docker socket access via `dockerode`

API responsibilities:

- session authentication
- server CRUD
- start/stop/restart workflows
- compose file generation
- runtime status inspection
- property editing
- file system operations
- console log streaming and command execution
- config exposure such as `CONNECTION_IP`

### Shared contract

Location: `packages/api-contract`

This package exports the Elysia `App` type from the API so the web app can use `edenTreaty<App>(...)` with shared route, params, body, and WebSocket message types.

### Database

Primary tables:

- `users`
- `sessions`
- `servers`
- `backups`

Important constraints:

- `users.username` is unique
- `servers.port` is unique
- deleting a server cascades backup cleanup

### Runtime model

Server runtime configuration is generated in `apps/api/src/services/compose.ts` and currently targets the `itzg/minecraft-server` image. Supported server type mappings include:

- `vanilla`
- `paper`
- `fabric`
- `forge`
- `spigot`
- `bukkit`

## Current UX and Operational Flow

### Dashboard

The dashboard is the primary control surface. It shows:

- all known servers
- online/offline/missing state
- live CPU and RAM usage when available
- quick actions for start, stop, restart, recreate, and delete

If the runtime instance is missing but the database record still exists, the card presents the server as missing and offers:

- `Recreate`
- `Delete`

### Server Detail

The detail page consolidates all server-specific operations:

- overview
- settings
- `server.properties` editing
- file management
- log console

Settings changes that affect runtime configuration, such as `port`, `version`, `type`, or `memory`, return a `restartRequired` signal so the UI can tell the user a restart is needed.

### Connection address

The UI shows server connection addresses using:

```text
CONNECTION_IP:PORT
```

This avoids showing only `:25565` and lets the panel present a usable address for players.

## API Surface

High-level routes exposed by the API:

### Auth

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

### System

- `GET /health`
- `GET /config`

### Servers

- `GET /servers`
- `POST /servers`
- `GET /servers/:id`
- `PUT /servers/:id`
- `DELETE /servers/:id`
- `POST /servers/:id/start`
- `POST /servers/:id/stop`
- `POST /servers/:id/restart`
- `GET /servers/:id/stats`
- `GET /servers/:id/properties`
- `PUT /servers/:id/properties`

### Files

- `GET /servers/:id/files`
- `GET /servers/:id/files/content`
- `PUT /servers/:id/files/content`
- `POST /servers/:id/files/mkdir`
- `DELETE /servers/:id/files`
- `PATCH /servers/:id/files/rename`
- `POST /servers/:id/files/upload`
- `GET /servers/:id/files/download`

### Console

- `WS /servers/:id/console`

## Environment Variables

API environment file:

```env
DATABASE_URL=postgresql://mycubekub:mycubekub@localhost:5432/mycubekub
SERVERS_DIR=./servers
API_PORT=3000
CONNECTION_IP=192.168.0.1
```

Meaning:

- `DATABASE_URL`: PostgreSQL connection string used by the API and Drizzle
- `SERVERS_DIR`: location where per-server runtime folders are generated
- `API_PORT`: port used by the API server
- `CONNECTION_IP`: host/IP shown in the UI for Minecraft connection addresses

## Local Development

### Requirements

- Bun
- Docker and Docker Compose
- PostgreSQL
- access to `/var/run/docker.sock`

### 1. Install dependencies

```bash
cd apps/api && bun install
cd ../web && bun install
```

The repo now keeps lockfiles per project:

- `apps/api/bun.lock`
- `apps/web/bun.lock`

### 2. Create environment files

Create `apps/api/.env` from `apps/api/.env.example`.

If needed, create `apps/web/.env` from `apps/web/.env.example`.

### 3. Start PostgreSQL

You can run your own PostgreSQL instance or start one with Docker separately.

### 4. Apply database migrations

```bash
cd apps/api && bun run db:migrate
```

### 5. Seed the default admin user

```bash
cd apps/api && bun run db:seed
```

Default seeded credentials:

- username: `admin`
- password: `admin`

Change this immediately for any real deployment.

### 6. Start the apps in development mode

```bash
cd apps/api && bun dev
cd ../web && bun dev
```

That starts:

- API: `http://localhost:3000`
- Web: `http://localhost:5173`

## Available Scripts

From each project directory:

```bash
cd apps/api && bun dev
cd apps/api && bun run typecheck
cd apps/api && bun run test:smoke
cd apps/api && bun run db:migrate
cd apps/api && bun run db:seed
cd apps/web && bun dev
cd apps/web && bun run typecheck
```

## Type-Safe API Integration

The frontend uses Elysia Eden with the shared contract package:

- `apps/api/src/app.ts` exports `type App`
- `packages/api-contract` re-exports that type
- `apps/web/src/lib/api.ts` creates `edenTreaty<App>("/api")`

This gives typed route params, request bodies, JSON responses, file upload bodies, and console WebSocket messages across projects.

The main exception is file download, which remains a URL helper because it returns a binary file response instead of JSON.

## Data and File Layout

Generated runtime folders follow this pattern:

```text
servers/
`-- <server-id>/
    |-- docker-compose.yml
    `-- data/
```

The API treats `data/` as the editable file root for file manager operations and for `server.properties`.

## Safety and Constraints

### Port collisions are blocked

The project prevents duplicate ports in two layers:

- application-level validation before create/update
- database-level unique constraint on `servers.port`

This protects against both normal UI mistakes and race conditions.

### File access is sandboxed to the server data directory

The file routes resolve paths relative to:

```text
<server directory>/data
```

Path traversal is rejected to avoid escaping the managed server area.

### Settings updates are not all hot-applied

Changing values such as:

- port
- version
- type
- memory

updates the generated runtime configuration, but the running server may need a restart before those changes actually take effect. The UI already signals this through `restartRequired`.

## Known Limitations

These are worth understanding before calling the project production-ready:

- no automated test suite is included yet
- settings changes are not automatically applied with a forced restart
- default seeded credentials are intentionally insecure
- backup workflow exists in schema shape, but backup UX is not yet a first-class feature
- runtime management depends on host Docker socket access
- the console implementation currently streams runtime logs and uses command execution fallback behavior through the runtime environment

## Project Strengths Right Now

The current implementation is already strong in several practical areas:

- clear separation between API and web app
- useful operator workflow from dashboard to detail page
- real server file access from the browser
- live operational controls
- duplicate port protection
- cleanup on failed provisioning
- better visibility for missing runtime instances
- more polished UI and loading states than the initial version

## Recommended Next Steps

If this project is moving toward production use, the next high-value improvements are:

1. add automated smoke tests for create, update, start, stop, restart, and delete
2. improve backup creation and restore workflows
3. replace any remaining browser-native confirmations with in-app dialogs
4. add role-based auth or stronger admin bootstrap flow
5. improve operational observability and audit logging
6. add explicit health checks and readiness checks per managed server

## Build Status

At the time of writing, the project builds successfully with:

```bash
bun run --cwd apps/api build
bun run --cwd apps/web build
```

## Summary

`myCubeKub` is not just a static panel mockup. It is already a functional Minecraft server operations tool with:

- authenticated access
- real server lifecycle controls
- file management
- live logs
- per-server configuration
- a stronger UX layer than the raw mechanics alone

The project is in a solid state for continued development and internal use, with the main remaining work centered around production hardening, testing, and backup/recovery maturity.
