import { supabase } from "@/integrations/supabase/client";

export interface Subject {
  id: string;
  name: string;
  has_password: boolean;
  sort_order: number;
  created_at: string;
}

export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase.rpc("list_subjects");
  if (error) throw error;
  return (data ?? []) as Subject[];
}

export async function createSubject(name: string, password?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc("create_subject", {
    p_name: name.trim(),
    p_password: password?.trim() || null,
  });
  if (error) throw error;
  return data as string;
}

/** p_password: undefined = keep existing, '' = clear, non-empty = set new */
export async function updateSubject(
  id: string,
  name?: string,
  password?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("update_subject", {
    p_id: id,
    p_name: name?.trim() || null,
    p_password: password === undefined ? null : password?.trim() || "",
  });
  if (error) throw error;
}

export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_subject", { p_id: id });
  if (error) throw error;
}

/** Server validates password when required. Returns false if password wrong. */
export async function selectSubject(subjectId: string, password?: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc("select_subject", {
    p_subject_id: subjectId,
    p_password: password?.trim() || null,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function clearSubject(): Promise<void> {
  const { error } = await supabase.rpc("clear_subject");
  if (error) throw error;
}
