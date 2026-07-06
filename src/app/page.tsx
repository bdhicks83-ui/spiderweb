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
        <h1>🕸️ Spiderweb</h1>
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

  const { data: clusters, error: clustersError } = await supabase.rpc(
    "detect_clusters",
    {
      p_user_id: user.id,
      p_min_similarity: 0.82,
      p_min_members: 2,
    }
  );

  return (
    <main>
      <h1>🕸️ Spiderweb</h1>
      <p>Logged in as {user.email}</p>
      <h2>Pending insights: {count ?? 0}</h2>
      <p style={{ color: "#777" }}>
        Empty dashboard, live on the internet = Week 1 complete. ✅
        <br />
        Next: upload flow (Week 2).
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Emerging patterns
        </h2>

        {clustersError && (
          <p style={{ color: "#b91c1c" }}>
            Couldn&apos;t load patterns: {clustersError.message}
          </p>
        )}

        {!clustersError && (!clusters || clusters.length === 0) && (
          <p style={{ color: "#888" }}>
            No patterns detected yet. Keep capturing and approving insights —
            this section fills in on its own.
          </p>
        )}

        {!clustersError &&
          clusters &&
          clusters.map((cluster: any) => (
            <div
              key={cluster.hub_insight_id}
              style={{
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                padding: "1.25rem",
                marginBottom: "1rem",
              }}
            >
              <p style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                {cluster.member_count + 1} related insights
              </p>
              <p style={{ marginBottom: "0.75rem" }}>{cluster.hub_content}</p>
              <ul style={{ marginLeft: "1.25rem", color: "#444" }}>
                {cluster.member_contents.map((content: string, i: number) => (
                  <li key={i} style={{ marginBottom: "0.4rem" }}>
                    {content}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>
    </main>
  );
}
