// TEMP (deleted after use) — mint a real session for Brian's account so the
// production click-through can run in the in-app browser. No email is sent:
// admin generateLink returns the token_hash directly, verifyOtp exchanges it.
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const envRaw = await readFile(path.join(process.cwd(), ".env.local"), "utf-8");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "bdhicks83@gmail.com";

const { data: users, error: listErr } = await admin.auth.admin.listUsers();
if (listErr) throw listErr;
const user = users.users.find((u) => u.email === EMAIL);
if (!user) {
  console.log("USER NOT FOUND. Existing emails:", users.users.map((u) => u.email));
  process.exit(1);
}
console.log("User found:", user.id);

const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: EMAIL,
});
if (linkErr) throw linkErr;

let session = null;
for (const type of ["email", "magiclink"]) {
  const { data, error } = await anon.auth.verifyOtp({
    type,
    token_hash: link.properties.hashed_token,
  });
  if (!error && data.session) { session = data.session; break; }
  console.log(`verifyOtp(${type}) failed:`, error?.message);
}
if (!session) process.exit(1);

// Encode exactly like @supabase/ssr 0.6: "base64-" + base64url(JSON), chunked at 3180.
const ref = new URL(url).hostname.split(".")[0];
const name = `sb-${ref}-auth-token`;
const encoded =
  "base64-" +
  Buffer.from(JSON.stringify(session), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const CHUNK = 3180;
const cookies = [];
if (encoded.length <= CHUNK) {
  cookies.push({ name, value: encoded });
} else {
  for (let i = 0; i * CHUNK < encoded.length; i++) {
    cookies.push({ name: `${name}.${i}`, value: encoded.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
}

const js = cookies
  .map(
    (c) =>
      `document.cookie = ${JSON.stringify(
        `${c.name}=${c.value}; path=/; max-age=34560000; SameSite=Lax; Secure`
      )};`
  )
  .join("\n");

const out = process.argv[2];
await writeFile(out, js, "utf-8");
console.log(`OK — ${cookies.length} cookie chunk(s) written to`, out);
