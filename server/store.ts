import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
  createMatch(match: MatchRecord): Promise<void>;
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
    const { error } = await this.client.rpc('recover_interrupted');
    check(error);
  }
  async createMatch(m: MatchRecord) {
    const { error } = await this.client
      .from('matches')
      .insert({
        id: m.id,
        game_type: m.game,
        match_type: m.type,
        competition_id: m.competitionId,
        player1_id: m.players[0].id,
        player2_id: m.players[1].id,
      });
    check(error);
  }
  async saveCompetition(lobby: LobbyView) {
    if (lobby.category === 'room') return;
    const { error } = await this.client.rpc('save_competition', { p_state: lobby });
    check(error);
  }
  async finishMatch(
    m: MatchRecord,
    winner: string | null,
    reason: FinishReason,
    competition: LobbyView | null,
  ) {
    const { error } = await this.client.rpc('finalize_match', {
      p_id: m.id,
      p_winner: winner,
      p_reason: reason,
      p_competition: competition,
    });
    check(error);
  }
}
