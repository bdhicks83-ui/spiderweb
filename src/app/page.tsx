// Week 1 goal: log in and see this empty dashboard live on the internet.
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main>
        <h1>🕷️ Spiderweb</h1>
        <p>It remembers.</p>
        <p>
          <Link href="/login">Log in →</Link>
        </p>
      </main>
    );
  }

  const { count } = await supabase
    .from("insights")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <main>
      <h1>🕷️ Spiderweb</h1>
      <p>Logged in as {user.email}</p>
      <h2>Pending insights: {count ?? 0}</h2>
      <p style={{ color: "#777" }}>
        Empty dashboard, live on the internet = Week 1 complete. ✅
        <br />
        Next: upload flow (Week 2).
      </p>
    </main>
  );
}
