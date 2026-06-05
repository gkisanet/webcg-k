/**
 * CgVariationGallery — Step 4: AI 생성 결과 Variation 선택기
 * 2×2 그리드로 생성된 CG 디자인 표시 + 저장/사용/재생성 액션
 */

import { GraphicPreviewRenderer } from "../GraphicPreviewRenderer";
import type { CgVariation } from "../../lib/overlayTypes";

interface CgVariationGalleryProps {
    variations: CgVariation[];
    onSaveToGallery: (variation: CgVariation) => void;
    onUseVariation: (variation: CgVariation) => void;
    onRegenerate: () => void;
}

export function CgVariationGallery({
    variations,
    onSaveToGallery,
    onUseVariation,
    onRegenerate,
}: CgVariationGalleryProps) {
    if (variations.length === 0) {
        return (
            <div className="wizard-empty">
                <div className="wizard-empty-icon">🎨</div>
                <div className="wizard-empty-text">
                    생성된 CG가 없습니다. 프롬프트를 입력하고 생성 버튼을 눌러주세요.
                </div>
            </div>
        );
    }

    return (
        <div className="variation-gallery-grid">
            {variations.map((v) => (
                <div key={v.id} className="variation-card">
                    {/* SVG 프리뷰 */}
                    <div className="variation-preview">
                        <GraphicPreviewRenderer
                            elements={v.elements}
                            canvasWidth={v.canvasSize.width}
                            canvasHeight={v.canvasSize.height}
                        />
                    </div>

                    {/* 정보 */}
                    <div className="variation-info">
                        <div className="variation-name">{v.name}</div>
                        <div className="variation-desc">{v.description}</div>

                        {/* 태그 */}
                        {v.tags.length > 0 && (
                            <div className="gallery-card-tags" style={{ marginBottom: 8 }}>
                                {v.tags.map((tag) => (
                                    <span key={tag} className="gallery-tag">{tag}</span>
                                ))}
                            </div>
                        )}

                        {/* 액션 버튼 */}
                        <div className="variation-actions">
                            <button
                                className="btn-variation-save"
                                onClick={() => onSaveToGallery(v)}
                                title="내 갤러리에 저장"
                            >
                                💾 저장
                            </button>
                            <button
                                className="btn-variation-use"
                                onClick={() => onUseVariation(v)}
                                title="이 디자인을 오버레이로 사용"
                            >
                                ✅ 사용
                            </button>
                            <button
                                className="btn-variation-regen"
                                onClick={onRegenerate}
                                title="다시 생성"
                            >
                                🔄 재생성
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
