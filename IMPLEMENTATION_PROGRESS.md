# Implementation progress

## Current Goal
Preserve the existing local puzzle games while adding authenticated, server-authoritative online quick matches, rooms, tournaments and leagues, durable results, and Render/Supabase deployment.

## Completed
- Inspected all existing game, input, rendering and test code.
- Verified baseline: 45 logic tests and Vite production build pass.
- Confirmed shared Battle/rules have no browser dependency.
- Confirmed GitHub SSH remote is reachable.
- Read Supabase/Render deployment skills and current Supabase changelog.

## In Progress
- Save the existing implementation as a recoverable baseline.
- Design shared protocol, authenticated server lifecycle and durable competition state.

## Remaining
- Auth/profile UI; protocol; server; online UI; migrations and RLS.
- Quick/room/tournament/league flows and reconnect handling.
- Puyo hard-drop removal, garbage animation, Tetris HUD adjustments.
- Integration, regression, browser and production QA; deployment.

## Architecture Decisions
- Reuse src/core/Battle.ts and existing rule engines on the server.
- Socket.IO: 60 Hz server simulation and 20 Hz public snapshots. Clients send actions only.
- Supabase provides Auth and durable Postgres records; no gameplay over Realtime.
- Exact allowed frontend origins. Server-only service key. No development auth bypass in production.
- Existing CPU/local modes remain independent of online availability.
- Existing source has no character-select feature to preserve.

## Quick Match State
Not implemented.
## Room Match State
Not implemented.
## Tournament State
Not implemented.
## League State
Not implemented.
## Supabase State
Signed-in organization ei2537 (ggknuarcllypthgwmimm), Free plan; no projects exist yet. Provider MCP tools are not exposed in this session; browser/CLI fallback is available.
## Render State
Installed plugin has no exposed service tools in this session. Dashboard inspection pending.
## GitHub State
Remote: git@github.com:ei2537/PuyoTeto.git. main at 76fbf53 initially tracked only index.html; existing implementation was untracked. No force pushes.
## Added Files
IMPLEMENTATION_PROGRESS.md; baseline game source/tests/docs/config will be tracked in the initial checkpoint.
## Modified Files
.gitignore (protect secrets and generated server output; retain exclusions for supplied assets/reference site).
## Migrations Applied
None.
## Environment Variables Required
Frontend: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key accepted), VITE_GAME_SERVER_URL.
Server: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_ORIGIN, PORT.
Never put server secrets in VITE_* or commit .env files.
## Tests Passed
2026-09-27: npm test (45/45), npm run build.
## Tests Failing
None at baseline.
## Known Issues
- No physical gamepad connected for real hardware QA.
- Remote projects/services are not provisioned yet.
## Next Exact Action
Commit baseline, add shared protocol and server/auth dependencies, implement secure database schema and server managers.
