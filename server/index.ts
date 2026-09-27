import { createGameServer } from './app';
import { SupabaseStore } from './store';
const required = (key: string) => {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
};
const origins = required('CLIENT_ORIGIN')
  .split(',')
  .map((v) => v.trim());
if (
  origins.some(
    (v) =>
      new URL(v).origin !== v ||
      (!v.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(v)),
  )
)
  throw new Error('CLIENT_ORIGIN must contain exact HTTP(S) origins, without paths or wildcards');
const store = new SupabaseStore(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'));
const server = await createGameServer({
  store,
  authenticate: (token) => store.authenticate(token),
  origins,
});
const port = Number(process.env.PORT || 3001);
server.http.listen(port, '0.0.0.0', () => console.log(`Game server listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
