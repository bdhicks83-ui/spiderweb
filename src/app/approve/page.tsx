'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Insight = {
  id: string;
  content: string;
  source_id: string;
  status: string;
};

export default function ApprovePage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadInsights();
  }, []);

  async function loadInsights() {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('insights')
        .select('id, content, source_id, status')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        setLoadError('Could not load insights. Try refreshing.');
        setInsights([]);
      } else {
        setInsights(data || []);
        setIndex(0);
      }
    } catch (err) {
      setLoadError('Something went wrong loading insights.');
      setInsights([]);
    }
    setLoading(false);
  }

  async function decide(status: 'approved' | 'rejected') {
    if (processing) return;
    setProcessing(true);
    setActionError(null);

    const current = insights[index];

    try {
      const { error } = await supabase
        .from('insights')
        .update({ status, decided_at: new Date().toISOString() })
        .eq('id', current.id);

      if (error) {
        setActionError('That didn\'t save. Try again.');
        setProcessing(false);
        return;
      }

      setProcessing(false);
      setIndex((prev) => prev + 1);
    }