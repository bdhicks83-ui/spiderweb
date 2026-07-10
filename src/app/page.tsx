// Homepage — Human Bloom marketing page for visitors, Spiderweb dashboard when logged in.
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  DEPARTMENTS,
  PLAN_LABELS,
  normalizePlan,
  unlockedDepartments,
} from "@/lib/access";
import DraftFrameworkButton from "@/components/DraftFrameworkButton";
import ApproveFrameworkButton from "@/components/ApproveFrameworkButton";
import MarketingHome from "@/components/MarketingHome";

export const metadata: Metadata = {
  title: "Human Bloom — Your AI Company. Built Around You.",
  description: "The Operating System for Human Expertise.",
};

export default async function Dashboard() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Logged out → animated marketing homepage (Phase 4)
  if (!user) {
    return <MarketingHome />;
  }

  // ─── Phase 4: plan → unlocked departments ───
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = normalizePlan(profile?.plan);
  const unlocked = new Set(unlockedDepartments(plan));

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

  // Phase 3: drafted frameworks, keyed by the cluster's hub insight
  const { data: frameworks } = await supabase
    .from("frameworks")
    .select("id, hub_insight_id, name, description, writeup, status");
  const frameworkByHub = new Map(
    (frameworks ?? []).map((f) => [f.hub_insight_id, f])
  );

  return (
    <main>
      <h1>🕸️ Spiderweb</h1>
      <p>
        Logged in as {user.email} ·{" "}
        <span
          style={{
            background: "#eef2ff",
            color: "#4338ca",
            border: "1px solid #c7d2fe",
            borderRadius: 999,
            padding: "0.15rem 0.6rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {PLAN_LABELS[plan]}
        </span>
      </p>

      {/* ─── Your Dashboard hub link (Phase 5 cards, credibility score,
             resume, gaps, verification all live here) ─── */}
      <Link
        href="/dashboard"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginTop: "1.5rem",
          padding: "1rem 1.25rem",
          background: "#0f172a",
          border: "1px solid #1e293b",
          borderRadius: 12,
          textDecoration: "none",
          color: "#fff",
        }}
      >
        <span>
          <span style={{ fontWeight: 700, fontSize: "1.05rem" }}>
            📊 Your Dashboard
          </span>
          <span
            style={{
              display: "block",
              color: "#94a3b8",
              fontSize: "0.85rem",
              marginTop: "0.15rem",
            }}
          >
            Your Spiderweb&apos;s value, credibility score, resume, and insights
            that need your context.
          </span>
        </span>
        <span style={{ color: "#7dd3fc", fontWeight: 600, whiteSpace: "nowrap" }}>
          Open →
        </span>
      </Link>

      {/* ─── Departments ─── */}
      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "1rem" }}>
          Departments
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "1rem",
          }}
        >
          {DEPARTMENTS.map((dept) => {
            const isUnlocked = unlocked.has(dept.key);

            const cardStyle: React.CSSProperties = {
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: "1.25rem",
              background: isUnlocked ? "#fff" : "#f5f5f4",
              opacity: isUnlocked ? 1 : 0.65,
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
              minHeight: 120,
            };

            const inner = (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span style={{ fontSize: "1.5rem" }}>{dept.emoji}</span>
                  {!isUnlocked && <span style={{ fontSize: "1.1rem" }}>🔒</span>}
                </div>
                <p style={{ fontWeight: 600, margin: 0 }}>{dept.name}</p>
                <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>
                  {dept.description}
                </p>
                {isUnlocked ? (
                  dept.href ? (
                    <p
                      style={{
                        color: "#4338ca",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        margin: "auto 0 0",
                      }}
                    >
                      Open →
                    </p>
                  ) : (
                    <p
                      style={{
                        color: "#999",
                        fontSize: "0.8rem",
                        margin: "auto 0 0",
                      }}
                    >
                      Coming soon
                    </p>
                  )
                ) : (
                  <p
                    style={{
                      color: "#92400e",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      margin: "auto 0 0",
                    }}
                  >
                    Upgrade to {PLAN_LABELS[dept.minPlan]} to unlock
                  </p>
                )}
              </>
            );

            // Locked or no route yet → plain (non-clickable) card
            if (!isUnlocked || !dept.href) {
              return (
                <div key={dept.key} style={cardStyle} aria-disabled={!isUnlocked}>
                  {inner}
                </div>
              );
            }

            // Unlocked with a route → clickable card
            return (
              <Link
                key={dept.key}
                href={dept.href}
                style={{ ...cardStyle, textDecoration: "none", color: "inherit" }}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <h2 style={{ marginTop: "2rem" }}>Pending insights: {count ?? 0}</h2>

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
          clusters.map((cluster: any) => {
            const framework = frameworkByHub.get(cluster.hub_insight_id);
            const isApproved = framework?.status === "approved";
            return (
              <div
                key={cluster.hub_insight_id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  padding: "1.25rem",
                  marginBottom: "1rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.5rem",
                  }}
                >
                  <p style={{ fontWeight: 600, margin: 0 }}>
                    {cluster.member_count + 1} related insights
                  </p>
                  {isApproved && (
                    <span
                      style={{
                        background: "#dcfce7",
                        color: "#15803d",
                        border: "1px solid #86efac",
                        borderRadius: 999,
                        padding: "0.15rem 0.6rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✅ Approved
                    </span>
                  )}
                </div>
                <p style={{ marginBottom: "0.75rem" }}>{cluster.hub_content}</p>
                <ul style={{ marginLeft: "1.25rem", color: "#444" }}>
                  {cluster.member_contents.map((content: string, i: number) => (
                    <li key={i} style={{ marginBottom: "0.4rem" }}>
                      {content}
                    </li>
                  ))}
                </ul>

                {framework && (
                  <div
                    style={{
                      marginTop: "1rem",
                      padding: "1rem",
                      background: isApproved ? "#f2f9f2" : "#fafaf5",
                      border: isApproved
                        ? "1px solid #bbdcbb"
                        : "1px solid #e0ddd0",
                      borderRadius: 6,
                    }}
                  >
                    <p
                      style={{
                        fontSize: "0.75rem",
                        color: isApproved ? "#15803d" : "#888",
                        fontWeight: isApproved ? 600 : 400,
                        marginBottom: "0.25rem",
                      }}
                    >
                      {isApproved
                        ? "✅ APPROVED FRAMEWORK"
                        : "DRAFTED FRAMEWORK · draft"}
                    </p>
                    <p style={{ fontWeight: 600, marginBottom: "0.35rem" }}>
                      {framework.name}
                    </p>
                    <p style={{ color: "#555", marginBottom: "0.6rem", fontStyle: "italic" }}>
                      {framework.description}
                    </p>
                    <p style={{ color: "#333", whiteSpace: "pre-wrap" }}>
                      {framework.writeup}
                    </p>
                  </div>
                )}

                <div
                  style={{
                    marginTop: "0.75rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "flex-start",
                  }}
                >
                  <DraftFrameworkButton
                    hubInsightId={cluster.hub_insight_id}
                    redraft={!!framework}
                    approved={isApproved}
                  />
                  {framework && !isApproved && (
                    <ApproveFrameworkButton frameworkId={framework.id} />
                  )}
                </div>
              </div>
            );
          })}
      </section>
    </main>
  );
}
