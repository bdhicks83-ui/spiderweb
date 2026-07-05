"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function UploadPage() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const supabase = createClient();

  async function handleSubmit() {
    if (!text.trim() && !file) {
      setStatus("Add some text or a screenshot first.");
      return;
    }

    setStatus("Uploading...");

    try {
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
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: inserted.id }),
        });
        if (!res.ok) {
          setStatus("Saved, but text extraction failed. It'll show as an error in your sources.");
          setText("");
          setFile(null);
          return;
        }
      }

      setStatus("Saved! ✅");
      setText("");
      setFile(null);
    } catch (err) {
      setStatus("Something went wrong. Try