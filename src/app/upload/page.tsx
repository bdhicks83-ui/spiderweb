"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UploadPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const supabase = createClient();

  async function handleSubmit() {
    setStatus("Uploading...");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setStatus("Not logged in.");
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
      return;
    }

    if (filePath) {
      await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: inserted.id }),
      });
    }

    setStatus("Saved! ✅");
    setText("");
    setFile(null);
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
      />
      <p>Or upload a screenshot:</p>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <br /><br />
      <button onClick={handleSubmit}>Submit</button>
      <p>{status}</p>
    </div>
  );
}
