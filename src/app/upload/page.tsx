"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

type Phase = "idle" | "submitting" | "waiting";

export default function UploadPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [waitRun, setWaitRun] = useState(0); // bumped on retry to restart timers
  const [retrying, setRetrying] = useState(false);
  const [gateChecked, setGateChecked] = useState(false);
  const router = useRouter();

  // Phase 6 Slice 1 — brand-new users (no goal set AND no sources yet)
  // do onboarding before their first upload.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        // Not logged in — let the existing submit-time check handle it.
        setGateChecked(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("goal_track")
        .eq("id", user.id)
        .single();
      if (cancelled) return;

      if (!profile?.goal_track) {
        const { count } = await supabase
          .from("sources")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (cancelled) return;
        if ((count ?? 0) === 0) {
          router.replace("/onboarding");
          return;
        }
      }
      setGateChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Waiting phase: tick a timer + poll for insights tied to this source
  useEffect(() => {
    if (phase !== "waiting" || !sourceId) return;

    let done = false;
    const startedAt = Date.now();

    const tick = setInterval(() => {
      if (!done) setWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);

    const poll = setInterval(async () => {
      const { count, error } = await supabase
        .from("insights")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId);

      if (!done && !error && (count ?? 0) > 0) {
        done = true;
        clearInterval(tick);
        clearInterval(poll);
        router.push("/approve");
      }
    }, 1500);

    return () => {
      done = true;
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase, sourceId, waitRun, router]);

  async function handleSubmit() {
    if (!text.trim() && !file) {
      setStatus("Add some text or a screenshot first.");
      return;
    }

    setPhase("submitting");
    setStatus("Uploading...");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus("Not logged in.");
        setPhase("idle");
        return;
      }

      let filePath: string | null = null;
      if (file) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(path, file);
        if (uploadError) {
          setStatus(`Upload failed: ${uploadError.message}`);
          setPhase("idle");
          return;
        }
        filePath = path;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("sources")
        .insert({
          user_id: user.id,
          raw_text: text || null,
          file_path: filePath,
        })
        .select()
        .single();

      if (insertError) {
        setStatus(`Save failed: ${insertError.message}`);
        setPhase("idle");
        return;
      }

      if (filePath) {
        const ocrRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: inserted.id }),
        });
        if (!ocrRes.ok) {
          setStatus("Saved, but text extraction failed. It will show as an error in your sources.");
          setPhase("idle");
          setText("");
          setFile(null);
          return;
        }
      }

      const insightsRes = await fetch("/api/extract-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: inserted.id }),
      });
      if (!insightsRes.ok) {
        setStatus("Saved, but insight extraction failed to start.");
        setPhase("idle");
        setText("");
        setFile(null);
        return;
      }

      // Enter waiting state — polling effect takes over from here
      setText("");
      setFile(null);
      setStatus("");
      setSourceId(inserted.id);
      setWaitSeconds(0);
      setPhase("waiting");
    } catch (err) {
      setStatus("Something went wrong. Try again.");
      setPhase("idle");
    }
  }

  async function handleRetry() {
    if (!sourceId || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch("/api/extract-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_id: sourceId }),
      });
      if (res.ok) {
        // Restart the clock and keep polling
        setWaitSeconds(0);
        setWaitRun((n) => n + 1);
      } else {
        setStatus("Retry failed to start. You can still go to Approve.");
      }
    } catch {
      setStatus("Retry failed to start. You can still go to Approve.");
    }
    setRetrying(false);
  }

  if (!gateChecked) {
    return (
      <div style={styles.center}>
        <div style={styles.spinner} aria-hidden="true" />
        <style>{`@keyframes upload-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (phase === "waiting") {
    const message =
      waitSeconds < 4
        ? "Reading your content..."
        : waitSeconds < 8
          ? "Almost there..."
          : "This is taking longer than usual";

    return (
      <div style={styles.center}>
        <div style={styles.spinner} aria-hidden="true" />
        <h2 style={styles.waitHeading}>{message}</h2>
        {waitSeconds >= 8 && (
          <>
            <button style={styles.primaryButton} onClick={() => router.push("/approve")}>
              Go to Approve
            </button>
            <button style={styles.quietButton} onClick={handleRetry} disabled={retrying}>
              {retrying ? "Retrying..." : "Retry extraction"}
            </button>
          </>
        )}
        {status && <p style={styles.statusText}>{status}</p>}
        <style>{`@keyframes upload-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ padding: 40, maxWidth: 500 }}>
      <h1>Upload</h1>
      <p>Paste text:</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        style={{ width: "100%" }}
        disabled={phase === "submitting"}
      />
      <p>Or upload a screenshot:</p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        disabled={phase === "submitting"}
      />
      <br /><br />
      <button onClick={handleSubmit} disabled={phase === "submitting"}>
        {phase === "submitting" ? "Uploading..." : "Submit"}
      </button>
      <p>{status}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "16px",
    fontFamily: "system-ui, sans-serif",
    textAlign: "center",
    padding: "24px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: "4px solid #e5e5e5",
    borderTopColor: "#555",
    animation: "upload-spin 0.8s linear infinite",
  },
  waitHeading: {
    fontSize: "20px",
    fontWeight: 600,
    margin: 0,
  },
  primaryButton: {
    padding: "12px 24px",
    fontSize: "16px",
    fontWeight: 600,
    border: "none",
    borderRadius: "10px",
    backgroundColor: "#22c55e",
    color: "#fff",
    cursor: "pointer",
  },
  quietButton: {
    padding: "6px 12px",
    fontSize: "13px",
    border: "none",
    background: "none",
    color: "#888",
    textDecoration: "underline",
    cursor: "pointer",
  },
  statusText: {
    color: "#ef4444",
    fontSize: "14px",
    margin: 0,
  },
};
