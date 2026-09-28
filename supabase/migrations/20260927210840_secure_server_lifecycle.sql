-- Supabase's optional automatic-RLS event trigger does not need API execution rights.
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- A new process fences the old process during Render's overlapping deploy window.
-- Only one simulation process may own this project at a time.
create table private.server_epoch(singleton boolean primary key default true check(singleton), epoch uuid not null);
revoke all on private.server_epoch from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on private.server_epoch to service_role;
create function private.assert_epoch(p_epoch uuid) returns void language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from private.server_epoch where epoch=p_epoch) then raise exception 'Server epoch replaced' using errcode='55000'; end if;
end $$;
revoke all on function private.assert_epoch(uuid) from public,anon,authenticated;
grant execute on function private.assert_epoch(uuid) to service_role;

create function public.begin_server(p_epoch uuid) returns void language plpgsql set search_path='' as $$
begin
  insert into private.server_epoch(singleton,epoch) values(true,p_epoch) on conflict(singleton) do update set epoch=excluded.epoch;
  perform public.recover_interrupted();
end $$;
create function public.check_server(p_epoch uuid) returns boolean language sql set search_path='' as $$
  select exists(select 1 from private.server_epoch where epoch=p_epoch);
$$;
create function public.server_save_competition(p_epoch uuid,p_state jsonb) returns void language plpgsql set search_path='' as $$
begin
  perform epoch from private.server_epoch where singleton for share;
  perform private.assert_epoch(p_epoch);
  perform public.save_competition(p_state);
end $$;
create function public.server_create_match(p_epoch uuid,p_match jsonb,p_competition jsonb default null) returns void language plpgsql set search_path='' as $$
begin
  perform epoch from private.server_epoch where singleton for share;
  perform private.assert_epoch(p_epoch);
  insert into public.matches(id,game_type,match_type,competition_id,player1_id,player2_id)
  values((p_match->>'id')::uuid,p_match->>'game',p_match->>'type',(p_match->>'competitionId')::uuid,(p_match->'players'->0->>'id')::uuid,(p_match->'players'->1->>'id')::uuid);
  perform public.save_competition(p_competition);
end $$;
create function public.server_finish_match(p_epoch uuid,p_id uuid,p_winner uuid,p_reason text,p_competition jsonb default null) returns boolean language plpgsql set search_path='' as $$
begin
  perform epoch from private.server_epoch where singleton for share;
  perform private.assert_epoch(p_epoch);
  return public.finalize_match(p_id,p_winner,p_reason,p_competition);
end $$;
revoke all on function public.begin_server(uuid),public.check_server(uuid),public.server_save_competition(uuid,jsonb),public.server_create_match(uuid,jsonb,jsonb),public.server_finish_match(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.begin_server(uuid),public.check_server(uuid),public.server_save_competition(uuid,jsonb),public.server_create_match(uuid,jsonb,jsonb),public.server_finish_match(uuid,uuid,uuid,text,jsonb) to service_role;
