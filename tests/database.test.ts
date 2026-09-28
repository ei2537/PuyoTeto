import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('Postgres migration: Auth trigger, unique profiles, RLS, service-only RPC and idempotent results', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20260927100509_online_foundation.sql', import.meta.url),
        'utf8',
      ),
    );
    const migrationDir = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrationDir)).filter((f) =>
      f.endsWith('_secure_server_lifecycle.sql'),
    ))
      await db.exec(await readFile(new URL(file, migrationDir), 'utf8'));
    const a = randomUUID(),
      b = randomUUID(),
      c = randomUUID(),
      match = randomUUID();
    await db.query('insert into auth.users values ($1,$2),($3,$4),($5,$6)', [
      a,
      { username: 'alpha' },
      b,
      { username: 'bravo' },
      c,
      {},
    ]);
    const profiles = await db.query('select * from public.profiles');
    assert.equal(profiles.rows.length, 3);
    await assert.rejects(
      db.query('insert into auth.users values ($1,$2)', [randomUUID(), { username: 'ALPHA' }]),
    );
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`,
    );
    await db.query('update public.profiles set username=$1 where id=$2', ['alpha_new', a]);
    await assert.rejects(db.query('update public.profiles set wins=99 where id=$1', [a]));
    const changed = await db.query(
      'update public.profiles set username=$1 where id=$2 returning id',
      ['stolen', b],
    );
    assert.equal(changed.rows.length, 0);
    await assert.rejects(
      db.query('select public.finalize_match($1,$2,$3,null)', [match, a, 'top_out']),
    );
    await assert.rejects(db.exec('select public.recover_interrupted()'));
    await assert.rejects(
      db.query(
        'insert into public.matches(id,game_type,match_type,player1_id,player2_id) values($1,$2,$3,$4,$5)',
        [match, 'puyo', 'quick', a, b],
      ),
    );
    await db.exec('reset role;set role service_role;');
    await db.query(
      'insert into public.matches(id,game_type,match_type,player1_id,player2_id) values($1,$2,$3,$4,$5)',
      [match, 'puyo', 'quick', a, b],
    );
    await db.query('select public.finalize_match($1,$2,$3,null)', [match, a, 'top_out']);
    await db.query('select public.finalize_match($1,$2,$3,null)', [match, a, 'top_out']);
    const wins = await db.query<{ wins: number }>('select wins from public.profiles where id=$1', [
      a,
    ]);
    assert.equal(wins.rows[0].wins, 1);
    const epoch = randomUUID(),
      nextEpoch = randomUUID(),
      interrupted = randomUUID();
    await db.query('select public.begin_server($1)', [epoch]);
    await db.query('select public.server_create_match($1,$2,null)', [
      epoch,
      {
        id: interrupted,
        game: 'tetris',
        type: 'quick',
        competitionId: null,
        players: [{ id: a }, { id: b }],
      },
    ]);
    await db.query('select public.begin_server($1)', [nextEpoch]);
    assert.equal(
      (
        await db.query<{ finish_reason: string }>(
          'select finish_reason from public.matches where id=$1',
          [interrupted],
        )
      ).rows[0].finish_reason,
      'server_restart',
    );
    await assert.rejects(
      db.query('select public.server_finish_match($1,$2,$3,$4,null)', [
        epoch,
        interrupted,
        a,
        'top_out',
      ]),
    );
    assert.equal(
      (await db.query<{ wins: number }>('select wins from public.profiles where id=$1', [a]))
        .rows[0].wins,
      1,
    );
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${c}',false);`,
    );
    assert.equal((await db.query('select * from public.matches')).rows.length, 0);
    await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);`);
    assert.equal((await db.query('select * from public.matches')).rows.length, 2);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.exec('select * from public.profiles'));
    await assert.rejects(db.exec('select public.save_competition(null)'));
  } finally {
    await db.close();
  }
});
