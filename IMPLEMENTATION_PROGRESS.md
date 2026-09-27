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

- Browser regression and real Supabase/Render deployment.
- Audit competition/disconnect edge cases and production service lifecycle.

## Remaining

- Apply and verify production migrations/RLS; configure Auth URLs and service environment.
- Browser QA for all online modes and reconnect handling.
- Polish Puyo drop behavior/garbage animation and Tetris left HOLD layout.
- Integration, regression, browser and production QA; deployment.

## Architecture Decisions

- Reuse src/core/Battle.ts and existing rule engines on the server.
- Socket.IO: 60 Hz server simulation and 20 Hz public snapshots. Clients send actions only.
- Supabase provides Auth and durable Postgres records; no gameplay over Realtime.
- Exact allowed frontend origins. Server-only service key. No development auth bypass in production.
- Existing CPU/local modes remain independent of online availability.
- Existing source has no character-select feature to preserve.

## Quick Match State

Implemented; manager/Socket.IO tests pass. Browser/production QA pending.

## Room Match State

Implemented; manager/Socket.IO tests pass. Browser/production QA pending.

## Tournament State

Implemented; manager/Socket.IO tests pass. Browser/production QA pending.

## League State

Implemented; manager/Socket.IO tests pass. Browser/production QA pending.

## Supabase State

User created PuyoTeto project fmfaoxcxuaaeypzompyc in Tokyo on Free plan. Initial migration is being applied via SQL Editor. Provider tools not exposed; using browser UI and official SDK/CLI.

## Render State

Dashboard authenticated in My Workspace; no services yet. Blueprint preparation in progress.

## GitHub State

Remote: git@github.com:ei2537/PuyoTeto.git. main at 76fbf53 initially tracked only index.html; existing implementation was untracked. No force pushes. Branch feat/online-multiplayer tracks origin; baseline commit 55eb7fd pushed.

## Added Files

IMPLEMENTATION_PROGRESS.md, shared/protocol.ts, server/{Hub,MatchRoom,competition,snapshot,store,app,index}.ts, src/online/{Auth,OnlineClient,OnlineUI}.ts and online.css, src/ui/PlayerView.ts, tests/{online,database}.test.ts, scripts/build-server.mjs, .env.example, server/.env.example, supabase/migrations/20260927100509_online_foundation.sql.

## Modified Files

.gitignore (protect secrets and generated server output; retain exclusions for supplied assets/reference site).

## Migrations Applied

None.

## Environment Variables Required

Frontend: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key accepted), VITE_GAME_SERVER_URL.
Server: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_ORIGIN, PORT.
Never put server secrets in VITE_* or commit .env files.

## Tests Passed

2026-09-27: baseline 45/45; expanded suite 59/59 (actual embedded Postgres RLS tests + real Socket.IO transport). Frontend and server TypeScript/build checks pass.

## Tests Failing

None at baseline.

## Known Issues

- No physical gamepad connected for real hardware QA.
- Render services not provisioned yet. Supabase initial schema application pending verification.
- Updated browser tests and production signup/email confirmation QA pending.

## Next Exact Action

Verify SQL Editor result, obtain existing project keys into ignored env files, run browser regression, audit server lifecycle, push tested checkpoint and deploy Blueprint.
