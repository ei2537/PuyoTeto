# Implementation progress

## Current Goal

Preserve the local games; finish and deploy authenticated authoritative online matches, rooms, tournaments and leagues. Resume existing work without resetting it.

## Completed

- Preserved and tested the original local games in 55eb7fd; online implementation in 1d52680.
- Shared Battle/rules on a 60 Hz Socket.IO server with 20 Hz snapshots, verified Supabase identity, input validation and reconnect grace.
- Quick matches, public/private rooms, concurrent matches, tournaments and leagues; atomic/idempotent durable results and wins.
- Supabase Auth, profile/history UI, RLS and service-only result RPCs.
- Puyo hard drop removed throughout engine/CPU/network; garbage animation; Tetris HOLD on left, NEXT on right; callouts outside boards.
- Fixed desktop vertical overflow and confirmation dialog being removed during competition withdrawal.
- Applied both Supabase migrations; added server epoch fencing for overlapping deployments and atomic fixture/match creation.
- Authenticated browser QA: quick match/reconnect/rematch/history, 4-person private room, completed tournament and all 6 league fixtures pass individually.
- Authored Render configuration and GitHub CI. render.yaml passes the official JSON schema.

## In Progress

- Render deployment and production verification. Local browser 9/9, fixed-build online 5/5 and production CPU smoke pass.
- Render provisioning and production configuration/QA.

## Remaining

- Create Render Free web service and static site from the tested feature branch.
- Configure Supabase Auth production URL/redirects.
- Run production multiplayer and local game smoke; verify logs and durable results.
- Finish deployment/architecture/QA documentation and Git checkpoint.

## Architecture Decisions

- Reuse src/core/Battle.ts/rules. Clients send input only; no client win/board authority.
- Supabase Auth/Postgres; no gameplay over Supabase Realtime.
- Exact frontend origins; service secret stays server-side. No production auth bypass.
- One simulation instance per database. Restart cancels interrupted matches/competitions without awarding wins. Epoch fencing prevents an old deployment writing after replacement.
- Render auto-deploy disabled deliberately: deploying the single server interrupts matches. Release explicitly.
- Existing source had no character-select feature; none was removed.

## Quick Match State

Implemented. Unit/Socket.IO and authenticated Tetris browser flow pass; added equivalent Puyo browser flow.

## Room Match State

Implemented. 4/8/16 capacity, private codes, host controls/migration, concurrent 1v1; four real accounts/two simultaneous matches pass in browser.

## Tournament State

Implemented. 4/8 players, randomized brackets, ready gate, walkovers and champion. Unit tests and complete four-account browser tournament pass.

## League State

Implemented. 4/6/8 round robin, deterministic tie rules/shared rank, durable standings. Unit tests and complete four-account/six-match browser league pass. Earlier interrupted click timeout did not reproduce on rerun.

## Supabase State

PuyoTeto fmfaoxcxuaaeypzompyc, Tokyo, Free, ACTIVE_HEALTHY verified. Both migrations present; all five public tables have RLS and security advisor has no findings. Ignored .env.local/server/.env contain existing keys. Four confirmed QA accounts were provisioned through Auth admin API without sending mail; credentials in ignored .env.qa.json. Production Auth URLs and real email-delivery check remain.

## Render State

My Workspace tea-dasbdjojo6nc73b2kuig: no services as of latest read. render.yaml validates. Deploy Free Node service in Singapore plus static CDN site; no paid plan authorized/needed.

## GitHub State

Public ei2537/PuyoTeto, origin reachable and writable. feat/online-multiplayer tracks origin; checkpoint f460694 pushed; main remains 76fbf53. No PR yet. No force pushes.

## Added Files

shared/protocol.ts; server/{Hub,MatchRoom,competition,snapshot,store,app,index}.ts; src/online/{Auth,OnlineClient,OnlineUI}.ts and online.css; src/ui/PlayerView.ts; tests/{online,database}.test.ts; tests/browser/online.spec.ts; scripts/{build-server,qa-users}.mjs; .env.example; server/.env.example; two supabase/migrations; render.yaml; .github/workflows/ci.yml; this progress file.

## Modified Files

package.json/package-lock.json; tsconfig.json; .gitignore; src/main.ts/style.css; PuyoGame/PuyoCPU; Renderer; browser/core/Puyo tests; playwright.config.ts; production smoke script. Existing baseline was checkpointed before these changes.

## Migrations Applied

20260927100509_online_foundation; 20260927210840_secure_server_lifecycle. Remote migration history verified.

## Environment Variables Required

Frontend: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (publishable key accepted), VITE_GAME_SERVER_URL.
Server: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLIENT_ORIGIN, PORT. Never expose the service secret via VITE_* or commit env files.

## Tests Passed

- 59/59 unit/logic/actual embedded Postgres RLS/real Socket.IO tests, latest full run 2026-09-28 JST.
- Frontend and server TypeScript/build checks pass before current final regression.
- Local browser 9/9 pass, including both desktop layouts. Production CPU smoke passes with zero console errors.
- Real-account quick, private room, tournament, league browser scenarios pass individually.
- Render Blueprint official JSON schema validation passes.

## Tests Failing

Fixed production preview: all 5 online browser cases pass in one run. Cleanup now leaves the competition from the account-history screen and waits for server acknowledgement. GitHub Linux CI found an emulated-pad neutral-frame race; test corrected, CI rerun pending.

## Known Issues

- Physical Xbox/generic PC controller hardware not available; simulated two-pad API tests only.
- Render not deployed yet. User confirmed no SMTP provider/sending domain; general-public signup confirmation delivery remains blocked on SMTP configuration.
- Free hosting cold starts and single-instance restart interruption are expected constraints.

## Next Exact Action

Collect current full browser/build/smoke test results, checkpoint and push. Stop the local Supabase-backed simulation on port 3001 BEFORE starting production. Provision Render with ignored secret transferred directly to its environment, configure Auth URLs, then run QA_BASE_URL production browser checks. Do not restart a local simulation pointed at the production Supabase project.
