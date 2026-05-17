/**
 * New Grid Template Page
 * 새 그리드 템플릿 만들기 - 빈 캔버스로 시작
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "../../../../../lib/supabase";
import { useAuth } from "../../../../../lib/auth";

export const Route = createFileRoute(
  "/dashboard/studio/graphics/grid-templates/new",
)({
  component: NewGridTemplatePage,
});

function NewGridTemplatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [templateName, setTemplateName] = useState("새 그리드 템플릿");

  const handleCreate = async () => {
    if (!user) {
      alert("로그인이 필요합니다");
      return;
    }

    setCreating(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase
        .from("grid_templates")
        .insert({
          name: templateName,
          description: null,
          owner_id: user.id,
          template_data: {
            name: templateName,
            canvas: { width: 1920, height: 1080 },
            zones: [],
            splits: [],
          },
        } as any)
        .select()
        .single();

      if (error) throw error;

      // 에디터로 이동
      navigate({
        to: "/dashboard/studio/graphics/grid-templates/$templateId",
        params: { templateId: (data as any).id },
      });
    } catch (error) {
      console.error("템플릿 생성 실패:", error);
      alert("템플릿 생성에 실패했습니다");
      setCreating(false);
    }
  };

  return (
    <div className="grid-editor-fullscreen">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "2rem",
        }}
      >
        <h1 style={{ fontSize: "2rem", color: "var(--text-primary)" }}>
          새 그리드 템플릿
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", width: "300px" }}>
          <input
            type="text"
            className="template-name-input"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="템플릿 이름"
            style={{
              padding: "0.75rem 1rem",
              fontSize: "1rem",
              backgroundColor: "var(--app-bg-muted)",
              border: "1px solid var(--border-default)",
              borderRadius: "8px",
              color: "var(--text-primary)",
            }}
          />

          <Button
            onClick={handleCreate}
            disabled={creating || !templateName.trim()}
            style={{ padding: "0.75rem 1rem", fontSize: "1rem" }}
          >
            {creating ? "생성 중..." : "빈 캔버스로 시작"}
          </Button>

          <Button
            variant="secondary"
            onClick={() => navigate({ to: "/dashboard/studio/grid-templates" })}
            style={{ padding: "0.75rem 1rem", fontSize: "1rem" }}
          >
            취소
          </Button>
        </div>

        <p style={{ color: "var(--text-tertiary)", fontSize: "0.875rem", textAlign: "center" }}>
          클릭으로 영역을 분할하세요.<br />
          Shift + 클릭: 가로선 / 클릭: 세로선
        </p>
      </div>
    </div>
  );
}
