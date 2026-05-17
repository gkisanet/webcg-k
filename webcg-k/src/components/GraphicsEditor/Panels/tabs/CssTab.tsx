/**
 * CSS Tab — Custom CSS 에디터
 *
 * PropertiesPanel에서 추출된 CSS 탭 서브 컴포넌트.
 * 15줄 정도의 작은 컴포넌트지만, 탭별 일관된 분리 원칙을 유지하기 위해 독립 파일로 분리.
 */

import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

interface CssTabProps {
    element: GraphicElement;
    handleChange: (field: keyof GraphicElement, value: string | number | boolean) => void;
}

export function CssTab({ element, handleChange }: CssTabProps) {
    return (
        <div className="ins-section">
            <div className="ins-section-title">Custom CSS</div>
            <textarea
                className="ins-textarea"
                value={element.customCSS || ""}
                onChange={(e) => handleChange("customCSS", e.target.value)}
                placeholder={`/* 커스텀 스타일 */
box-shadow: 0 4px 12px rgba(0,0,0,0.15);
backdrop-filter: blur(10px);`}
            />
        </div>
    );
}
