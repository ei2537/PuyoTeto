import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { FinishReason, Identity, LobbyView, MatchType, Profile } from '../shared/protocol';
import type { GameKind } from '../src/core/types';
export interface MatchRecord {
  id: string;
  game: GameKind;
  type: MatchType;
  competitionId: string | null;
  players: [Profile, Profile];
}
export interface Store {
  recover(): Promise<void>;
  createMatch(match: MatchRecord, competition?: LobbyView | null): Promise<void>;
  isCurrent?(): Promise<boolean>;
  saveCompetition(lobby: LobbyView): Promise<void>;
  finishMatch(
    match: MatchRecord,
    winner: string | null,
    reason: FinishReason,
    competition: LobbyView | null,
  ): Promise<void>;
}
function check(error: { message: string } | null) {
  if (error) throw new Error('Database operation failed', { cause: error.message });
}
export class SupabaseStore implements Store {
  client: SupabaseClient;
  readonly epoch = randomUUID();
  constructor(url: string, key: string) {
    this.client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  async authenticate(token: string): Promise<Identity> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user)
      throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
    const { data: profile, error: profileError } = await this.client
      .from('profiles')
      .select('id,username,wins')
      .eq('id', data.user.id)
      .single();
    if (profileError || !profile) throw new Error('プロフィールを取得できません。');
    // getUser above verifies this JWT with Auth; only then read its expiry.
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (typeof payload.exp !== 'number') throw new Error('Invalid token');
    return { ...profile, expiresAt: payload.exp * 1000 };
  }
  async recover() {
    const { error } = await this.client.rpc('begin_server', { p_epoch: this.epoch });
    check(error);
  }
  async isCurrent() {
    const { data, error } = await this.client.rpc('check_server', { p_epoch: this.epoch });
    check(error);
    return data === true;
  }
  async createMatch(m: MatchRecord, competition: LobbyView | null = null) {
    const { error } = await this.client.rpc('server_create_match', {
      p_epoch: this.epoch,
      p_match: m,
      p_competition: competition,
    });
    check(error);
  }
  async saveCompetition(lobby: LobbyView) {
    if (lobby.category === 'room') return;
    const { error } = await this.client.rpc('server_save_competition', {
      p_epoch: this.epoch,
      p_state: lobby,
    });
    check(error);
  }
  async finishMatch(
    m: MatchRecord,
    winner: string | null,
    reason: FinishReason,
    competition: LobbyView | null,
  ) {
    const { error } = await this.client.rpc('server_finish_match', {
      p_epoch: this.epoch,
      p_id: m.id,
      p_winner: winner,
      p_reason: reason,
      p_competition: competition,
    });
    check(error);
  }
}
