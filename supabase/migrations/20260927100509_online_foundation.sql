-- Explicit grants: intended to work with Supabase's auto-expose setting disabled.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  wins integer not null default 0 check (wins >= 0),
  created_at timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles (lower(username));
alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;
grant all on public.profiles to service_role;
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_rename on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function private.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen text;
begin
  chosen := trim(new.raw_user_meta_data ->> 'username');
  if chosen is null or chosen !~ '^[A-Za-z0-9_]{3,20}$' then chosen := 'player_' || substr(replace(new.id::text, '-', ''), 1, 12); end if;
  insert into public.profiles(id, username) values(new.id, chosen);
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated, service_role;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.create_profile();

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key(requester_id, addressee_id), check(requester_id <> addressee_id)
);
create unique index friendships_pair_unique on public.friendships (least(requester_id,addressee_id), greatest(requester_id,addressee_id));
create index friendships_addressee on public.friendships(addressee_id);
alter table public.friendships enable row level security;
grant select, insert, delete on public.friendships to authenticated;
grant update(status) on public.friendships to authenticated;
grant all on public.friendships to service_role;
create policy friendships_read on public.friendships for select to authenticated using ((select auth.uid()) in (requester_id,addressee_id));
create policy friendships_request on public.friendships for insert to authenticated with check (requester_id=(select auth.uid()) and status='pending');
create policy friendships_reply on public.friendships for update to authenticated using (addressee_id=(select auth.uid())) with check (addressee_id=(select auth.uid()) and status in ('accepted','declined'));
create policy friendships_remove on public.friendships for delete to authenticated using ((select auth.uid()) in (requester_id,addressee_id));

create table public.competitions (
  id uuid primary key,
  category text not null check (category in ('tournament','league')),
  game_type text not null check (game_type in ('puyo','tetris')),
  name text not null check (length(name) between 1 and 32),
  visibility text not null check (visibility in ('public','private')),
  host_id uuid not null references public.profiles(id),
  status text not null check (status in ('waiting','running','finished','cancelled')),
  capacity integer not null check (capacity in (4,6,8)),
  champion_id uuid references public.profiles(id),
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.competition_members (
  competition_id uuid not null references public.competitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  primary key (competition_id,user_id)
);
create index competition_members_user on public.competition_members(user_id);
create index competitions_host on public.competitions(host_id);
create index competitions_champion on public.competitions(champion_id);
create index competitions_open on public.competitions(created_at desc) where status in ('waiting','running');
alter table public.competitions enable row level security;
alter table public.competition_members enable row level security;
grant select on public.competitions, public.competition_members to authenticated;
grant all on public.competitions, public.competition_members to service_role;
create policy memberships_read on public.competition_members for select to authenticated using (user_id=(select auth.uid()));
create policy competitions_read on public.competitions for select to authenticated using (visibility='public' or host_id=(select auth.uid()) or id in (select competition_id from public.competition_members where user_id=(select auth.uid())));

create table public.matches (
  id uuid primary key,
  game_type text not null check (game_type in ('puyo','tetris')),
  match_type text not null check (match_type in ('quick','room','tournament','league')),
  competition_id uuid references public.competitions(id),
  player1_id uuid not null references public.profiles(id),
  player2_id uuid not null references public.profiles(id),
  winner_id uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  finish_reason text check (finish_reason in ('top_out','disconnect','surrender','draw','server_restart')),
  check (player1_id <> player2_id),
  check (winner_id is null or winner_id in (player1_id,player2_id)),
  check ((ended_at is null and finish_reason is null and winner_id is null) or (ended_at is not null and finish_reason is not null))
);
create index matches_player1 on public.matches(player1_id,started_at desc);
create index matches_player2 on public.matches(player2_id,started_at desc);
create index matches_winner on public.matches(winner_id);
create index matches_competition on public.matches(competition_id);
alter table public.matches enable row level security;
grant select on public.matches to authenticated;
grant all on public.matches to service_role;
create policy matches_read on public.matches for select to authenticated using ((select auth.uid()) in (player1_id,player2_id) or competition_id in (select id from public.competitions));

-- These RPCs are SECURITY INVOKER and executable ONLY by the server's service role.
-- A single transaction publishes a competition update + result + lifetime win.
create function public.save_competition(p_state jsonb) returns void language plpgsql set search_path = '' as $$
begin
  if p_state is null then return; end if;
  insert into public.competitions(id,category,game_type,name,visibility,host_id,status,capacity,champion_id,state,created_at)
  values ((p_state->>'id')::uuid,p_state->>'category',p_state->>'game',p_state->>'name',p_state->>'visibility',(p_state->>'host')::uuid,p_state->>'phase',(p_state->>'capacity')::integer,(p_state->>'champion')::uuid,p_state - 'code',(p_state->>'createdAt')::timestamptz)
  on conflict(id) do update set name=excluded.name,visibility=excluded.visibility,host_id=excluded.host_id,status=excluded.status,champion_id=excluded.champion_id,state=excluded.state,updated_at=now();
  -- Keep historical membership after a participant withdraws.
  insert into public.competition_members(competition_id,user_id)
  select (p_state->>'id')::uuid,(member->>'id')::uuid from jsonb_array_elements(p_state->'members') member
  on conflict do nothing;
end;
$$;
create function public.finalize_match(p_id uuid, p_winner uuid, p_reason text, p_competition jsonb default null) returns boolean language plpgsql set search_path = '' as $$
declare changed integer;
begin
  update public.matches set winner_id=p_winner,finish_reason=p_reason,ended_at=now() where id=p_id and ended_at is null;
  get diagnostics changed = row_count;
  if changed = 0 then return false; end if;
  if p_winner is not null then update public.profiles set wins=wins+1 where id=p_winner; end if;
  perform public.save_competition(p_competition);
  return true;
end;
$$;
create function public.recover_interrupted() returns void language plpgsql set search_path = '' as $$
begin
  update public.matches set ended_at=now(),finish_reason='server_restart' where ended_at is null;
  update public.competitions set status='cancelled',updated_at=now(),state=jsonb_set(state,'{phase}','"cancelled"'::jsonb) || '{"interruptionReason":"server_restart"}'::jsonb where status in ('waiting','running');
end;
$$;
revoke all on function public.save_competition(jsonb), public.finalize_match(uuid,uuid,text,jsonb), public.recover_interrupted() from public,anon,authenticated;
grant execute on function public.save_competition(jsonb), public.finalize_match(uuid,uuid,text,jsonb), public.recover_interrupted() to service_role;
