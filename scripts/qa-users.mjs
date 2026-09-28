// Explicit QA provisioning; never imported by the application or included in builds.
// Creates four email-confirmed test users without sending email. Secrets stay in ignored .env.qa.json.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const file = new URL('../.env.qa.json', import.meta.url);
try {
  await readFile(file);
  console.log('QA accounts already provisioned; reusing .env.qa.json');
  process.exit(0);
} catch {}
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const batch = Date.now().toString(36),
  users = [];
for (let i = 1; i <= 4; i++) {
  const username = `qa_${batch}_${i}`,
    email = `${username}@example.com`,
    password = randomBytes(24).toString('base64url');
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw new Error(`Could not provision QA user: ${error.message}`);
  users.push({ id: data.user.id, username, email, password });
  await writeFile(file, JSON.stringify(users, null, 2));
}
console.log(
  `Provisioned ${users.length} QA accounts without sending mail. Credentials are Git-ignored.`,
);
