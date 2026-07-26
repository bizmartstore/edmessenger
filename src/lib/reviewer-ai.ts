/** Client helper — generate reviewer questions via Worker + Gemini. */
import { supabase } from "@/integrations/supabase/client";
import type { ParsedReviewerQuestion } from "@/lib/reviewer-parse";

export async function generateReviewerQuestions(input: {
  topic: string;
  notes?: string;
  count?: number;
}): Promise<ParsedReviewerQuestion[]> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch("/api/ai/generate-reviewer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic: input.topic,
      notes: input.notes ?? "",
      count: input.count ?? 5,
    }),
  });

  const json = (await res.json()) as {
    ok?: boolean;
    error?: string;
    questions?: ParsedReviewerQuestion[];
  };
  if (!res.ok || !json.ok) {
    throw new Error(json.error || `Generate failed (${res.status})`);
  }
  return json.questions ?? [];
}
