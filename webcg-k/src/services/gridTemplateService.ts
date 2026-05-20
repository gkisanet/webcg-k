/**
 * gridTemplateService — grid_templates 테이블 CRUD.
 */
import { supabase } from "../lib/supabase";

export interface GridTemplate {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  template_data?: any;
  thumbnail_path?: string | null;
  splits?: any;
  zones?: any;
  created_at: string;
  updated_at: string;
}

export async function fetchGridTemplates(): Promise<GridTemplate[]> {
  const { data, error } = await supabase
    .from("grid_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as GridTemplate[];
}

export async function cloneGridTemplate(
  source: { name: string; description?: string | null; template_data?: any },
  userId: string,
): Promise<GridTemplate> {
  const { data, error } = await supabase
    .from("grid_templates")
    .insert({
      name: `${source.name} (복제)`,
      description: source.description,
      owner_id: userId,
      template_data: source.template_data,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as GridTemplate;
}

export async function updateGridTemplate(
  id: string,
  updates: { description?: string; is_public?: boolean; visibility?: "private" | "workspace" | "public"; workspace_id?: string | null },
): Promise<void> {
  const { error } = await supabase
    .from("grid_templates")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function updateGridTemplateVisibility(
  id: string,
  visibility: "private" | "workspace" | "public",
): Promise<void> {
  const { error } = await supabase
    .from("grid_templates")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGridTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("grid_templates").delete().eq("id", id);
  if (error) throw error;
}
