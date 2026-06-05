/**
 * Grid Templates List Component
 * 그리드 템플릿 목록 컴포넌트
 */

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { GridTemplateRow } from "../../lib/gridTypes";
import { Plus, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GridTemplatesList() {
  // Supabase에서 템플릿 목록 가져오기
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["gridTemplates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grid_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as unknown as GridTemplateRow[];
    },
  });

  if (isLoading) {
    return (
      <div className="graphics-loading">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="graphic-card-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* 빈 상태 */}
      {templates.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">
              <Grid3x3 size={48} />
            </div>
            <h3 className="empty-state-title">템플릿이 없습니다</h3>
            <p className="empty-state-description">
              새 그리드 템플릿을 만들어 방송 레이아웃을 표준화하세요
            </p>
            <Button asChild>
              <Link
                to="/dashboard/studio/graphics/grid-templates/new"
              >
                <Plus size={18} />처음 템플릿 만들기
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* 템플릿 그리드 */}
      {templates.length > 0 && (
        <div className="graphics-grid">
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      )}
    </>
  );
}

// 템플릿 카드 컴포넌트
function TemplateCard({ template }: { template: GridTemplateRow }) {
  const zoneCount = template.template_data.zones?.length || 0;

  return (
    <Link
      to="/dashboard/studio/graphics/grid-templates/$templateId"
      params={{ templateId: template.id }}
      className="graphic-card"
    >
      {/* 썸네일 */}
      <div className="graphic-thumbnail">
        {template.thumbnail_path ? (
          <img
            src={template.thumbnail_path}
            alt={template.name}
            className="graphic-thumbnail-img"
          />
        ) : (
          <div className="graphic-thumbnail-placeholder">
            <Grid3x3 size={48} />
          </div>
        )}
      </div>

      {/* 카드 내용 */}
      <div className="graphic-card-body">
        <div className="graphic-card-header">
          <h3 className="graphic-card-title">{template.name}</h3>
        </div>

        {template.description && (
          <p className="graphic-card-description">{template.description}</p>
        )}

        <div className="graphic-card-meta">
          <Grid3x3 size={12} />
          <span>{zoneCount}개 영역</span>
        </div>
      </div>
    </Link>
  );
}
