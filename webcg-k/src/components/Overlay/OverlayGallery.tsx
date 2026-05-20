/**
 * OverlayGallery — 내 오버레이 갤러리 뷰
 * overlay_gallery + overlay_templates JOIN 쿼리, 카드 그리드, 필터, 즐겨찾기
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Trash2, Loader2, Layers, Bot } from "lucide-react";
import { fetchMyGallery, toggleGalleryFavorite, removeFromGallery, updateOverlayTemplateVisibility } from "../../services/overlayApiService";
import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";
import type { OverlayGalleryItem } from "../../lib/overlayTypes";
import { VisibilityToggle } from "../Common/VisibilityToggle";

interface OverlayGalleryProps {
    onSelectForSession?: (templateId: string) => void;
}

export function OverlayGallery({ onSelectForSession }: OverlayGalleryProps) {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<"all" | "favorites">("all");

    const { data: items = [], isLoading } = useQuery({
        queryKey: ["overlayGallery"],
        queryFn: fetchMyGallery,
    });

    // 필터링
    const filtered = (items as unknown as OverlayGalleryItem[]).filter((item) => {
        if (filter === "favorites") return item.is_favorite;
        return true;
    });

    // 가시성 토글
    async function handleVisibilityToggle(templateId: string, nextVis: string) {
        try {
            await updateOverlayTemplateVisibility(templateId, nextVis as "private" | "workspace" | "public");
            queryClient.invalidateQueries({ queryKey: ["overlayGallery"] });
            queryClient.invalidateQueries({ queryKey: ["overlay_templates"] });
        } catch (e) {
            console.error("Failed to update visibility", e);
        }
    }

    // 즐겨찾기 토글
    async function handleToggleFavorite(item: OverlayGalleryItem) {
        await toggleGalleryFavorite(item.id, !item.is_favorite);
        queryClient.invalidateQueries({ queryKey: ["overlayGallery"] });
    }

    // 삭제
    async function handleDelete(item: OverlayGalleryItem) {
        if (!confirm(`"${item.name}" 을(를) 갤러리에서 삭제하시겠습니까?`)) return;
        await removeFromGallery(item.id);
        queryClient.invalidateQueries({ queryKey: ["overlayGallery"] });
    }

    if (isLoading) {
        return (
            <div className="wizard-loading" style={{ padding: 40 }}>
                <Loader2 size={24} className="wizard-loading-spinner" style={{ width: 24, height: 24 }} />
                <span className="wizard-loading-text">갤러리 로딩 중...</span>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="wizard-empty">
                <div className="wizard-empty-icon"><Layers size={48} /></div>
                <div className="wizard-empty-text">
                    저장된 오버레이가 없습니다. AI로 새 오버레이를 생성해보세요!
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* 필터 탭 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button
                    className={`btn-wizard ${filter === "all" ? "btn-wizard-primary" : "btn-wizard-secondary"}`}
                    style={{ padding: "6px 14px", fontSize: 13 }}
                    onClick={() => setFilter("all")}
                >
                    전체 ({items.length})
                </button>
                <button
                    className={`btn-wizard ${filter === "favorites" ? "btn-wizard-primary" : "btn-wizard-secondary"}`}
                    style={{ padding: "6px 14px", fontSize: 13 }}
                    onClick={() => setFilter("favorites")}
                >
                    ⭐ 즐겨찾기
                </button>
            </div>

            {/* 카드 그리드 */}
            <div className="overlay-gallery-grid">
                {filtered.map((item) => {
                    const tpl = item.template;
                    const elements = tpl?.graphic_data ?? [];
                    const isSemantic = tpl?.plugin_type === "semantic";

                    return (
                        <div key={item.id} className="gallery-card">
                            {/* 프리뷰 */}
                            <div className="gallery-card-preview">
                                {isSemantic ? (
                                    <div style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        gap: 8,
                                        color: "#475569",
                                        fontSize: 12,
                                        background: "var(--app-bg-raised, #1a1a2e)",
                                    }}>
                                        <Bot size={24} style={{ color: "var(--accent-primary)" }} />
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Semantic CG</span>
                                    </div>
                                ) : elements.length > 0 ? (
                                    <GraphicPreviewRenderer
                                        elements={elements}
                                        canvasWidth={tpl?.zone_bounds?.width ?? 1920}
                                        canvasHeight={tpl?.zone_bounds?.height ?? 1080}
                                    />
                                ) : (
                                    <div style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "#475569",
                                        fontSize: 12,
                                    }}>
                                        프리뷰 없음
                                    </div>
                                )}
                            </div>

                            {/* 정보 */}
                            <div className="gallery-card-body">
                                <div className="gallery-card-name">
                                    {item.is_favorite && "⭐ "}
                                    {item.name}
                                </div>
                                <div className="gallery-card-tags">
                                    {isSemantic && (
                                        <span className="gallery-tag" style={{ background: "var(--accent-primary)", color: "#000", fontWeight: 600 }}>
                                            Semantic
                                        </span>
                                    )}
                                    {item.tags.length > 0 && (
                                        item.tags.map((tag) => (
                                            <span key={tag} className="gallery-tag">{tag}</span>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* 액션 */}
                            <div className="gallery-card-actions" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    {onSelectForSession && !isSemantic && (
                                        <button onClick={() => onSelectForSession(item.template_id)}>
                                            ▶️ 세션에 추가
                                        </button>
                                    )}
                                    <button onClick={() => handleToggleFavorite(item)}>
                                        <Star size={12} fill={item.is_favorite ? "#fbbf24" : "none"} color={item.is_favorite ? "#fbbf24" : "currentColor"} />
                                    </button>
                                    <button onClick={() => handleDelete(item)} style={{ color: "#f87171" }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                {tpl && (
                                    <VisibilityToggle
                                        visibility={tpl.visibility || "workspace"}
                                        onToggle={(nextVis) => handleVisibilityToggle(tpl.id, nextVis)}
                                        size={14}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
