/**
 * AI 캐릭터 프리셋 관리 페이지
 * Rive 캐릭터 파일(.riv) 업로드 → ViewModel 자동 분석 → 액션 매핑
 *
 * 위자드 단계:
 *   Step 1: 기본 정보 (이름, 설명, .riv 파일)
 *   Step 2: 분석 결과 확인 + 액션 매핑 설정
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Edit, Bot, Loader2, Clock } from "lucide-react";
import { fetchPresets, deletePreset } from "../../../services/characterService";
import { supabase } from "../../../lib/supabase";
import type { AiCharacterPreset } from "../../../lib/aiCharacterTypes";
import { CharacterWizardModal, Badge, RivePreviewPanel } from "../../../components/Characters/CharacterWizardModal";
import { formatDateShort } from "../../../lib/utils/dateFormat";

import "../dashboard-common.css";

export const Route = createFileRoute("/dashboard/characters/")({
    component: CharactersPage,
});

// ─── 컴포넌트 ──────────────────────────────────────────────────

function CharactersPage() {
    const queryClient = useQueryClient();

    // 프리셋 목록
    const { data: presets = [], isLoading: loading } = useQuery({
        queryKey: ["ai_character_presets"],
        queryFn: () => fetchPresets<AiCharacterPreset>(),
    });

    const [wizardOpen, setWizardOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<AiCharacterPreset | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // 프리셋 삭제
    const handleDelete = useCallback(async (preset: AiCharacterPreset) => {
        try {
            await deletePreset(preset.id, preset.riv_file_path);
            setDeleteConfirm(null);
            queryClient.invalidateQueries({ queryKey: ["ai_character_presets"] });
        } catch (err) {
            console.error("삭제 실패:", err);
        }
    }, [queryClient]);

    const openCreateWizard = () => {
        setEditTarget(null);
        setWizardOpen(true);
    };

    const openEditWizard = (preset: AiCharacterPreset) => {
        setEditTarget(preset);
        setWizardOpen(true);
    };

    const closeWizard = () => {
        setWizardOpen(false);
        setEditTarget(null);
    };

    const handleWizardComplete = () => {
        closeWizard();
        queryClient.invalidateQueries({ queryKey: ["ai_character_presets"] });
    };

    // ─── 로딩 ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="dash-loading">
                <Loader2 size={24} className="animate-spin" />
            </div>
        );
    }

    return (
        <>
            {/* 페이지 헤더 */}
            <div className="dash-page-header">
                <div>
                    <div className="dash-page-title">
                        <div className="dash-page-title-icon">
                            <Bot size={18} />
                        </div>
                        AI 캐릭터
                    </div>
                    <div className="dash-page-subtitle">
                        .riv 파일 업로드 → ViewModel 분석 → 액션 버튼 매핑
                    </div>
                </div>
                <div className="dash-page-actions">
                    <button className="dash-btn primary" onClick={openCreateWizard}>
                        <Plus size={16} /> 캐릭터 추가
                    </button>
                </div>
            </div>

            {/* 카드 그리드 또는 빈 상태 */}
            {presets.length === 0 ? (
                <div className="dash-empty-state">
                    <div className="dash-empty-icon">
                        <Bot size={48} />
                    </div>
                    <div className="dash-empty-title">등록된 캐릭터가 없습니다</div>
                    <div className="dash-empty-desc">
                        Rive(.riv) 파일을 업로드하여 방송에서 사용할
                        AI 캐릭터를 등록해보세요
                    </div>
                    <button className="dash-btn primary" onClick={openCreateWizard}>
                        <Plus size={16} /> 첫 캐릭터 등록하기
                    </button>
                </div>
            ) : (
                <div className="dash-cards-grid">
                    {presets.map((preset) => {
                        // Supabase Storage 공개 URL
                        const rivUrl = preset.riv_file_path
                            ? supabase.storage.from("characters").getPublicUrl(preset.riv_file_path).data?.publicUrl
                            : null;
                        const smName = preset.rive_analysis?.stateMachines?.[0];

                        return (
                            <div
                                key={preset.id}
                                className="dash-card"
                                onClick={() => openEditWizard(preset)}
                            >
                                {/* .riv 썸네일 */}
                                <div className="dash-card-thumb">
                                    {rivUrl ? (
                                        <RivePreviewPanel src={rivUrl} stateMachineName={smName} />
                                    ) : (
                                        <div className="dash-card-thumb-empty">
                                            <Bot size={24} />
                                            <span>프리뷰 없음</span>
                                        </div>
                                    )}

                                    {/* 아트보드 비율 배지 */}
                                    {preset.rive_analysis?.artboardSize && (
                                        <span className="dash-card-badge">
                                            {preset.rive_analysis.artboardSize.width}×{preset.rive_analysis.artboardSize.height}
                                        </span>
                                    )}
                                </div>

                                {/* 카드 바디 */}
                                <div className="dash-card-body">
                                    <div className="dash-card-name">{preset.name}</div>
                                    {preset.description && (
                                        <div className="dash-card-desc">{preset.description}</div>
                                    )}
                                    <div className="dash-card-tags">
                                        {preset.rive_analysis ? (
                                            <>
                                                <Badge label={`${preset.rive_analysis.properties.length} 프로퍼티`} color="#6366f1" />
                                                <Badge label={`${preset.action_mappings.length} 액션`} color="#10b981" />
                                                {preset.rive_analysis.viewModelName && (
                                                    <Badge label={preset.rive_analysis.viewModelName} color="#f59e0b" />
                                                )}
                                            </>
                                        ) : (
                                            <Badge label="분석 필요" color="#ef4444" />
                                        )}
                                    </div>
                                </div>

                                {/* 카드 하단 */}
                                <div className="dash-card-footer">
                                    <div className="dash-card-date">
                                        <Clock size={10} />
                                        {formatDateShort(preset.created_at)}
                                    </div>
                                    <div className="dash-card-actions">
                                        <button
                                            className="dash-card-action-btn"
                                            onClick={(e) => { e.stopPropagation(); openEditWizard(preset); }}
                                            title="편집"
                                        >
                                            <Edit size={12} />
                                        </button>
                                        <button
                                            className="dash-card-action-btn delete"
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(preset.id); }}
                                            title="삭제"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* 삭제 확인 오버레이 */}
                                {deleteConfirm === preset.id && (
                                    <div className="dash-card-delete-confirm">
                                        <p>"{preset.name}" 삭제?</p>
                                        <div className="confirm-btns">
                                            <button
                                                className="dash-delete-cancel"
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                            >
                                                취소
                                            </button>
                                            <button
                                                className="dash-delete-confirm"
                                                onClick={(e) => { e.stopPropagation(); handleDelete(preset); }}
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 위자드 모달 */}
            {wizardOpen && (
                <CharacterWizardModal
                    editTarget={editTarget}
                    onComplete={handleWizardComplete}
                    onClose={closeWizard}
                />
            )}
        </>
    );
}
