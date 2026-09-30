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

- Real signup email delivery and confirmation-link check with the user's own account. Brevo phone verification and SMTP key creation are complete; user entered the key directly into Supabase and saved it.
- Final deployment/QA documentation checkpoint. Existing game implementations were preserved.

## Remaining

- Confirm actual signup email receipt and the confirmation link returning to the production site.
- Finish documentation and Git checkpoint after the email check.

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

PuyoTeto fmfaoxcxuaaeypzompyc, Tokyo, Free, ACTIVE_HEALTHY verified 2026-09-30 JST. Both migrations present; all five public tables have RLS. Security advisor reports only leaked-password protection disabled (Auth setting); no RLS findings. Ignored .env.local/server/.env contain existing keys. Four confirmed QA accounts were provisioned through Auth admin API without sending mail; credentials in ignored .env.qa.json.

Site URL and the sole allowed redirect URL are https://puyoteto-online.onrender.com. Custom SMTP enabled and persisted: Brevo, smtp-relay.brevo.com:587, sender name PuyoTeto, verified sender. The user created and entered the SMTP key directly; it is not in chat, repository, or Render variables. Minimum per-user interval remains 60 seconds. Real receipt/confirmation is pending user verification. Brevo connector confirms relay enabled and Free plan.

## Render State

My Workspace tea-dasbdjojo6nc73b2kuig. Both services deployed and LIVE since 2026-09-28, code SHA 1d2cb59cef1422878f472c43d297c343408c4d75. Verified again 2026-09-30 JST:

- Static Site puyoteto-online, srv-dast1abbc2fs73a81u3g: https://puyoteto-online.onrender.com
- Free Node service puyoteto-game, srv-dast17bbc2fs73a81ju0, Singapore: https://puyoteto-game.onrender.com
- CLIENT_ORIGIN matches the static site exactly; frontend server URL points to the live Node service. Node 24.14.1. Server secret stays in server env only.
- Health Check Path /health saved in Render Dashboard and confirmed by MCP. Public endpoint returns {ok:true,protocol:1}. Recent application error logs are empty.
- Auto-deploy OFF for both. No deployment is needed for documentation/QA-script-only changes.
- Services were created separately through MCP; render.yaml is a validated reproducible reference, not an attached Blueprint. Static headers saved in Dashboard and confirmed on real HTTP 200 response: nosniff, strict-origin-when-cross-origin, index.html no-cache.
- No paid resources created. Do not run a local simulation against this production Supabase database.

## GitHub State

Public ei2537/PuyoTeto, origin reachable and writable. feat/online-multiplayer tracks origin; checkpoint 1d2cb59 pushed; main remains 76fbf53. Latest deployed-code CI succeeded: https://github.com/ei2537/PuyoTeto/actions/runs/36369889183. No PR yet. No force pushes.

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
- 2026-09-30: real production URL, 5/5 online browser scenarios pass in one run (2 minutes). Both games' quick match/input/reload/reconnect/saved result/rematch/history; private room with four users and two simultaneous games; completed tournament and league.
- Production DB confirms 15 completed QA matches from that run, finished tournament with 3 fixtures/champion and finished league with 6 fixtures/champion. QA used surrender to finish online fixtures promptly; natural top-out is covered by local browser and shared-rule tests.
- 2026-09-30: actual Render static site CPU smoke succeeds for both games: Worker/player input/Canvas/HUD, console errors 0, development hook absent. QA_BASE_URL support added to the smoke script to reproduce this without starting a local simulation.
- Render Blueprint official JSON schema validation passes.

## Tests Failing

None currently. Emulated-pad neutral-frame race was corrected in 1d2cb59; GitHub Linux CI passes. Cleanup leaves the competition from the account-history screen and waits for server acknowledgement.

## Known Issues

- Physical Xbox/generic PC controller hardware not available; simulated two-pad API tests only.
- Actual SMTP receipt/confirmation-link test is in progress. Brevo setup and Supabase SMTP saving are complete; a custom sending domain has not been configured.
- Supabase leaked-password protection is disabled; advisor remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. No paid upgrade made.
- Free hosting cold starts and single-instance restart interruption are expected constraints.

## Next Exact Action

Wait for the user's real signup email confirmation, verify profile creation/login without exposing credentials, and update the final email-verification status. Documentation and QA-script checkpoint is being saved separately; preserve the deployed game SHA unless application code changes. Do not start a local simulation pointed at the production Supabase project.
