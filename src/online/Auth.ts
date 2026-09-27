import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Profile } from '../../shared/protocol';
export class Auth {
  client: SupabaseClient | null = null;
  session: Session | null = null;
  profile: Profile | null = null;
  loading = true;
  error = '';
  private generation = 0;
  onChange = () => {};
  constructor() {
    const url = import.meta.env.VITE_SUPABASE_URL,
      key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key || url.includes('YOUR_PROJECT')) {
      this.loading = false;
      return;
    }
    this.client = createClient(url, key);
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session = session;
      const generation = ++this.generation;
      queueMicrotask(() => {
        void this.loadProfile(generation);
      });
    });
  }
  async loadProfile(generation = this.generation) {
    try {
      const user = this.session?.user;
      if (!user) {
        this.profile = null;
        this.error = '';
        return;
      }
      const { data, error } = await this.client!.from('profiles')
        .select('id,username,wins')
        .eq('id', user.id)
        .single();
      if (generation !== this.generation) return;
      if (error) throw new Error('プロフィールを取得できません。再接続してください。');
      this.profile = data;
      this.error = '';
    } catch (error) {
      this.error = error instanceof Error ? error.message : '読み込みに失敗しました。';
    } finally {
      if (generation === this.generation) {
        this.loading = false;
        this.onChange();
      }
    }
  }
  async signIn(email: string, password: string) {
    const { error } = await this.client!.auth.signInWithPassword({ email, password });
    if (error)
      throw new Error('ログインできません。メール・パスワードとメール確認を確認してください。');
  }
  async signUp(email: string, password: string, username: string) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      throw new Error('ユーザー名は英数字・_の3〜20文字です。');
    const { data, error } = await this.client!.auth.signUp({
      email,
      password,
      options: { data: { username }, emailRedirectTo: location.origin },
    });
    if (error)
      throw new Error(
        '登録できません。ユーザー名の重複、パスワード条件、送信回数を確認してください。',
      );
    return data.session
      ? '登録しました。'
      : '確認メールを送信しました。メールのリンクから確認後、ログインしてください。';
  }
  async rename(username: string) {
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
      throw new Error('ユーザー名は英数字・_の3〜20文字です。');
    const { error } = await this.client!.from('profiles')
      .update({ username })
      .eq('id', this.session!.user.id);
    if (error) throw new Error('ユーザー名を変更できません。別の名前をお試しください。');
    await this.loadProfile();
  }
  async signOut() {
    const { error } = await this.client!.auth.signOut();
    if (error) throw new Error('ログアウトに失敗しました。再試行してください。');
  }
}
