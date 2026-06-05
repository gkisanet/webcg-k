/**
 * useCuesheetSync — NRCS 큐시트 변경 감지 hook.
 *
 * rundown_items 테이블의 UPDATE를 구독하여, 텍스트 변경이 감지되면
 * pendingChangesStore에 적재 → NrcsChangeAlert 배지 표시.
 */
import { useEffect } from "react";
import { supabase } from "../lib/supabase";
import { addPendingChange, type FieldChange } from "../stores/pendingChangesStore";
import type { GraphicBlock } from "../stores/timelineStore";

function getTextFieldLabel(key: string): string {
  const labelMap: Record<string, string> = {
    personName: "이름",
    personTitle: "직함",
    text: "본문",
    subtitle: "부제",
    source: "출처",
    headline: "헤드라인",
    crawlText: "크롤 텍스트",
    name: "이름",
    title: "제목",
    description: "설명",
    reporter: "기자명",
    location: "장소",
    date: "날짜",
    credit: "크레딧",
  };
  return labelMap[key] || key;
}

export function useCuesheetSync(
  rundownId: string | undefined,
  getCurrentBlocks: () => GraphicBlock[],
) {
  useEffect(() => {
    if (!rundownId) return;

    console.log("[CuesheetSync] 큐시트 변경 감지 구독 시작:", rundownId);

    const channel = supabase
      .channel(`cuesheet-sync:${rundownId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "rundown_items",
          filter: `rundown_id=eq.${rundownId}`,
        },
        (payload: any) => {
          const oldData = payload.old;
          const newData = payload.new;
          const itemId = newData?.id as string;

          if (!newData?.data) return;

          const oldElements: any[] = oldData?.data?.elements || [];
          const newElements: any[] = newData.data?.elements || [];
          const fieldChanges: FieldChange[] = [];

          for (const newEl of newElements) {
            if (newEl.type !== "text" || newEl.text === undefined) continue;
            const oldEl = oldElements.find((o: any) => o.id === newEl.id);
            const oldText = oldEl?.text ?? "";
            const newText = newEl.text ?? "";

            if (oldText !== newText) {
              fieldChanges.push({
                fieldKey: newEl.bindingKey || newEl.id,
                fieldLabel: getTextFieldLabel(newEl.bindingKey || newEl.id),
                oldValue: oldText,
                newValue: newText,
              });
            }
          }

          if (fieldChanges.length === 0) return;

          const currentBlocks = getCurrentBlocks();
          const matchingBlock = currentBlocks.find(
            (b) => b.cuesheetItemId === itemId || b.id === itemId,
          );

          addPendingChange({
            cuesheetItemId: itemId,
            blockId: matchingBlock?.id,
            blockName:
              matchingBlock?.name || newData.source_name || itemId.slice(0, 8),
            eventType: "UPDATE",
            fieldChanges,
            newRecord: newData.data,
            oldRecord: oldData?.data,
          });
        },
      )
      .subscribe((status) => {
        console.log("[CuesheetSync] 채널 상태:", status);
      });

    return () => {
      console.log("[CuesheetSync] 큐시트 변경 감지 구독 해제");
      channel.unsubscribe();
    };
  }, [rundownId, getCurrentBlocks]);
}
