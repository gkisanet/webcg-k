/**
 * graphicService — graphics 테이블 CRUD + AI 좌표 변환.
 */
import { supabase } from "../lib/supabase";

export interface GraphicInput {
  name: string;
  description?: string;
  owner_id: string;
  template_data: {
    elements: any[];
    canvas: { width: number; height: number };
    gridTemplateId?: string;
  };
}

export interface CgVariation {
  name: string;
  description?: string;
  elements: any[];
  canvasSize: { width: number; height: number };
}

export interface ZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Graphic {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  template_data: any;
  thumbnail_path: string | null;
  created_at: string;
  updated_at: string;
}

export async function createGraphic(input: GraphicInput): Promise<Graphic> {
  const { data, error } = await supabase
    .from("graphics")
    .insert(input as any)
    .select()
    .single();

  if (error) throw error;
  return data as unknown as Graphic;
}

export async function cloneGraphic(
  source: { name: string; description: string | null; template_data: any },
  userId: string,
): Promise<Graphic> {
  return createGraphic({
    name: `${source.name} (복제)`,
    description: source.description || undefined,
    owner_id: userId,
    template_data: source.template_data,
  });
}

/**
 * AI 생성 결과를 graphics 테이블에 저장 + zone offset 변환.
 *
 * AI는 선택된 영역 크기를 캔버스로 삼아 (0,0)부터 요소를 생성하므로,
 * 실제 그리드의 X, Y 위치로 오프셋시키고 캔버스 크기를 1920x1080으로 복원.
 */
export async function saveAiVariation(
  variation: CgVariation,
  meta: { gridId?: string; zoneBounds?: ZoneBounds },
  userId: string,
): Promise<Graphic> {
  let finalElements = variation.elements;
  let finalCanvasSize = variation.canvasSize;

  if (meta.zoneBounds) {
    finalElements = variation.elements.map((el) => ({
      ...el,
      x: (el.x || 0) + meta.zoneBounds!.x,
      y: (el.y || 0) + meta.zoneBounds!.y,
    }));
    finalCanvasSize = { width: 1920, height: 1080 };
  }

  return createGraphic({
    name: variation.name,
    description: variation.description,
    owner_id: userId,
    template_data: {
      elements: finalElements,
      canvas: finalCanvasSize,
      gridTemplateId: meta.gridId,
    },
  });
}

export async function fetchGraphics(): Promise<Graphic[]> {
  const { data, error } = await supabase
    .from("graphics")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Graphic[];
}

export async function updateGraphic(
  id: string,
  updates: { description?: string; is_public?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("graphics")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteGraphic(id: string): Promise<void> {
  const { error } = await supabase.from("graphics").delete().eq("id", id);
  if (error) throw error;
}
