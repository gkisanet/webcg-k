/**
 * Fonts Management Page
 * 폰트 관리 페이지 — 시스템 번들 + 사용자 업로드 폰트 통합 관리
 * [Lazy 로드 — 코드 스플리팅 적용]
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Upload,
  Loader2,
  X,
  Trash2,
  Type,
  Shield,
  AlertTriangle,
  Check,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../lib/auth";
import {
  fetchFonts,
  uploadFont,
  deleteFont,
  groupByFamily,
  type FontItem,
} from "../../../../services/fontService";
import { SYSTEM_FONTS } from "../../../../lib/fontRegistry";

import "../../dashboard-common.css";

// ─── 라우트 등록 ──────────────────────────────────────────────────
export const Route = createLazyFileRoute("/dashboard/assets/fonts/")({
  component: FontsPage,
});

// ─── 상수 ─────────────────────────────────────────────────────────

/** 폰트 Weight 라벨 매핑 */
const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

/** 업로드 모달 상태 */
interface UploadModalState {
  isOpen: boolean;
  familyName: string;
  displayName: string;
  weight: number;
  style: string;
  category: string;
  licenseType: string;
  licenseNotes: string;
  file: File | null;
}

/** 초기 업로드 모달 상태 */
const INITIAL_UPLOAD_STATE: UploadModalState = {
  isOpen: false,
  familyName: "",
  displayName: "",
  weight: 400,
  style: "normal",
  category: "custom",
  licenseType: "unknown",
  licenseNotes: "",
  file: null,
};

/** 라이선스 배지 색상 매핑 */
const LICENSE_COLORS: Record<string, string> = {
  OFL: "#22c55e",
  "Apache 2.0": "#3b82f6",
  "무료(상업용)": "#8b5cf6",
  Commercial: "#f59e0b",
  unknown: "#6b7280",
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────

function FontsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    null,
  );
  const { data: fonts = [], isLoading: loading } = useQuery<FontItem[]>({
    queryKey: ["fonts", selectedCategory],
    queryFn: () => fetchFonts(selectedCategory),
    enabled: !!user,
  });

  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [uploadModal, setUploadModal] =
    useState<UploadModalState>(INITIAL_UPLOAD_STATE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // weight 미리보기 상태: 하나의 폰트 + weight만 활성화, 다른 폰트 클릭 시 초기화
  const [activeWeightPreview, setActiveWeightPreview] = useState<{
    family: string;
    weight: number;
  } | null>(null);

  // 업로드된 폰트를 동적으로 @font-face 주입
  useEffect(() => {
    for (const font of fonts) {
      if (font.url) {
        const styleId = `dynamic-font-${font.family_name}-${font.weight}-${font.style}`;
        if (!document.getElementById(styleId)) {
          const style = document.createElement("style");
          style.id = styleId;
          style.textContent = `
						@font-face {
							font-family: "${font.family_name}";
							font-style: ${font.style};
							font-weight: ${font.weight};
							font-display: swap
							src: url("${font.url}") format("woff2");
						}
					`
          document.head.appendChild(style);
        }
      }
    }
  }, [fonts]);

  // 패밀리 그룹핑
  const fontFamilies = groupByFamily(fonts);
  const categories = ["system", "broadcast", "custom"];

  // ─── 업로드 핸들러 ────────────────────────────────

  const openUploadModal = () => {
    setUploadModal({ ...INITIAL_UPLOAD_STATE, isOpen: true });
  };

  const closeUploadModal = () => {
    setUploadModal(INITIAL_UPLOAD_STATE);
  };

  const handleUpload = async () => {
    if (!user || !uploadModal.file || !uploadModal.familyName) return;
    setUploading(true);
    try {
      await uploadFont(
        uploadModal.file,
        {
          family_name: uploadModal.familyName,
          display_name: uploadModal.displayName || uploadModal.familyName,
          weight: uploadModal.weight,
          style: uploadModal.style,
          category: uploadModal.category as "system" | "broadcast" | "custom",
          license_type: uploadModal.licenseType,
          license_notes: uploadModal.licenseNotes || undefined,
        },
        user.id,
      );
      queryClient.invalidateQueries({ queryKey: ["fonts"] });
      closeUploadModal();
    } catch (err) {
      console.error("Font upload error:", err);
      alert(
        `업로드 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
      );
    } finally {
      setUploading(false);
    }
  };

  // ─── 삭제 핸들러 ──────────────────────────────────

  const handleDelete = async (font: FontItem) => {
    try {
      await deleteFont(font.id, font.storage_path);
      queryClient.invalidateQueries({ queryKey: ["fonts"] });
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Font delete error:", err);
      alert("삭제 실패");
    }
  };

  // ─── 유틸리티 ─────────────────────────────────────

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getWeightLabel = (weight: number) =>
    WEIGHT_LABELS[weight] || `w${weight}`;

  const isOwner = (font: FontItem) => user?.id === font.owner_id;

  // ─── 렌더링 ───────────────────────────────────────

  return (
    <>
      {/* 페이지 헤더 */}
      <div className="dash-page-header">
        <div>
          <div className="dash-page-title">
            <div className="dash-page-title-icon">
              <Type size={18} />
            </div>
            폰트 관리
          </div>
          <div className="dash-page-subtitle">
            시스템 번들 {SYSTEM_FONTS.length}종 + 사용자 업로드 폰트
          </div>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn primary" onClick={openUploadModal}>
            <Upload size={16} /> 폰트 업로드
          </button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="dash-filter-group">
        <button
          className={`dash-filter-btn ${selectedCategory === null ? "active" : ""}`}
          onClick={() => setSelectedCategory(null)}
        >
          전체
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`dash-filter-btn ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === "system"
              ? "시스템"
              : cat === "broadcast"
                ? "방송용"
                : "커스텀"}
          </button>
        ))}
        {/* 한글 전용 필터 */}
        <button
          className={`dash-filter-btn ${selectedCategory === "korean" ? "active" : ""}`}
          onClick={() => setSelectedCategory("korean")}
          style={{ gap: "0.25rem" }}
        >
          🇰🇷 한글
        </button>
      </div>

      {/* ─── 시스템 번들 폰트 섹션 ─── */}
      {(selectedCategory === null || selectedCategory === "system" || selectedCategory === "broadcast" || selectedCategory === "korean") && (
        <>
          <div className="dash-card-name" style={{ fontSize: 15, marginBottom: 12 }}>
            <Shield size={16} />
            시스템 번들 폰트 ({SYSTEM_FONTS.filter(f => {
              if (selectedCategory === "korean") return f.isKorean;
              return selectedCategory === null || f.category === selectedCategory;
            }).length}종)
          </div>

          <div className="dash-cards-grid" style={{ marginBottom: 24 }}>
            {SYSTEM_FONTS.filter(f => {
              if (selectedCategory === "korean") return f.isKorean;
              return selectedCategory === null || f.category === selectedCategory;
            }).map((sf) => (
              <SystemFontCard
                key={sf.family}
                font={sf}
                activeWeightPreview={activeWeightPreview}
                onWeightPreviewChange={setActiveWeightPreview}
              />
            ))}
          </div>
        </>
      )}

      {/* ─── 업로드된 폰트 섹션 ─── */}
      {loading ? (
        <div className="dash-loading">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : fontFamilies.length > 0 ? (
        <>
          <div className="dash-card-name" style={{ fontSize: 15, marginBottom: 12, marginTop: 8 }}>
            <Upload size={16} />
            업로드된 폰트 ({fontFamilies.length}개 패밀리)
          </div>

          <div className="dash-cards-grid" style={{ marginBottom: 24 }}>
            {fontFamilies.map((family) => (
              <UploadedFontCard
                key={family.familyName}
                family={family}
                isOwner={isOwner}
                onDelete={handleDelete}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                formatFileSize={formatFileSize}
                getWeightLabel={getWeightLabel}
              />
            ))}
          </div>
        </>
      ) : selectedCategory !== null && selectedCategory !== "system" && selectedCategory !== "broadcast" ? (
        <div className="dash-empty-state">
          <div className="dash-empty-icon">
            <Type size={48} />
          </div>
          <div className="dash-empty-title">업로드된 폰트가 없습니다</div>
          <div className="dash-empty-desc">
            "폰트 업로드" 버튼으로 WOFF2/OTF/TTF 파일을 추가하세요
          </div>
          <button className="dash-btn primary" onClick={openUploadModal}>
            <Upload size={16} /> 폰트 업로드
          </button>
        </div>
      ) : null}

      {/* ─── 라이선스 안내 ─── */}
      <div
        style={{
          marginTop: "2rem",
          padding: "1.25rem",
          borderRadius: "0.75rem",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <h3
          style={{
            fontSize: "0.9rem",
            fontWeight: 600,
            marginBottom: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <AlertTriangle size={16} style={{ color: "#f59e0b" }} />
          라이선스 안내
        </h3>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            fontSize: "0.8rem",
          }}
        >
          {Object.entries(LICENSE_COLORS).map(([label, color]) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.25rem 0.625rem",
                borderRadius: "999px",
                background: `${color}20`,
                color,
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                }}
              />
              {label}
            </span>
          ))}
        </div>
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--text-secondary)",
            lineHeight: 1.5,
          }}
        >
          데스크탑 라이선스 폰트는 @font-face 사용이 불가합니다. 웹
          라이선스 또는 OFL/Apache 폰트만 업로드하세요.
        </p>
      </div>

      {/* ─── 업로드 모달 ─── */}
      {uploadModal.isOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
          onClick={closeUploadModal}
        >
          <div
            style={{
              background: "var(--surface-primary)",
              borderRadius: "1rem",
              padding: "1.5rem",
              width: "min(480px, 90vw)",
              maxHeight: "85vh",
              overflow: "auto",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
              }}
            >
              <h3
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Upload size={20} />
                폰트 업로드
              </h3>
              <button
                type="button"
                onClick={closeUploadModal}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
              }}
            >
              {/* 패밀리 이름 */}
              <label style={labelStyle}>
                폰트 패밀리 이름 *
                <input
                  type="text"
                  value={uploadModal.familyName}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      familyName: e.target.value,
                    }))
                  }
                  placeholder="예: Noto Sans KR"
                  style={inputStyle}
                />
              </label>

              {/* 표시 이름 */}
              <label style={labelStyle}>
                표시 이름
                <input
                  type="text"
                  value={uploadModal.displayName}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      displayName: e.target.value,
                    }))
                  }
                  placeholder="예: 본고딕"
                  style={inputStyle}
                />
              </label>

              {/* Weight + Style */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                <label style={labelStyle}>
                  굵기 (Weight)
                  <select
                    value={uploadModal.weight}
                    onChange={(e) =>
                      setUploadModal((s) => ({
                        ...s,
                        weight: Number(e.target.value),
                      }))
                    }
                    style={inputStyle}
                  >
                    {Object.entries(WEIGHT_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>
                        {val} — {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={labelStyle}>
                  스타일
                  <select
                    value={uploadModal.style}
                    onChange={(e) =>
                      setUploadModal((s) => ({
                        ...s,
                        style: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="normal">Normal</option>
                    <option value="italic">Italic</option>
                  </select>
                </label>
              </div>

              {/* Category + License */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                <label style={labelStyle}>
                  카테고리
                  <select
                    value={uploadModal.category}
                    onChange={(e) =>
                      setUploadModal((s) => ({
                        ...s,
                        category: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="broadcast">방송용</option>
                    <option value="custom">커스텀</option>
                  </select>
                </label>

                <label style={labelStyle}>
                  라이선스
                  <select
                    value={uploadModal.licenseType}
                    onChange={(e) =>
                      setUploadModal((s) => ({
                        ...s,
                        licenseType: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    <option value="OFL">OFL (무료)</option>
                    <option value="Apache 2.0">Apache 2.0 (무료)</option>
                    <option value="Commercial">상용 (구매)</option>
                    <option value="unknown">확인 필요</option>
                  </select>
                </label>
              </div>

              {/* 라이선스 메모 */}
              <label style={labelStyle}>
                라이선스 메모
                <input
                  type="text"
                  value={uploadModal.licenseNotes}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      licenseNotes: e.target.value,
                    }))
                  }
                  placeholder="구매처, 만료일 등"
                  style={inputStyle}
                />
              </label>

              {/* 파일 선택 */}
              <label style={labelStyle}>
                폰트 파일 *
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf"
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      file: e.target.files?.[0] || null,
                    }))
                  }
                  style={inputStyle}
                />
              </label>

              {uploadModal.file && (
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  선택: {uploadModal.file.name} (
                  {formatFileSize(uploadModal.file.size)})
                </p>
              )}
            </div>

            {/* 모달 푸터 */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.75rem",
                marginTop: "1.5rem",
                paddingTop: "1rem",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeUploadModal}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleUpload}
                disabled={
                  uploading || !uploadModal.file || !uploadModal.familyName
                }
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {uploading ? (
                  <Loader2
                    size={16}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Check size={16} />
                )}
                {uploading ? "업로드 중..." : "업로드"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── 스타일 상수 ──────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  fontSize: "0.8rem",
  fontWeight: 500,
  color: "var(--text-secondary)",
};

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderRadius: "0.5rem",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
};

const cardStyle: React.CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  transition: "border-color 0.2s, transform 0.15s",
};

// ─── 시스템 폰트 카드 ─────────────────────────────────────────────

function SystemFontCard({
  font,
  activeWeightPreview,
  onWeightPreviewChange,
}: {
  font: (typeof SYSTEM_FONTS)[number];
  activeWeightPreview: { family: string; weight: number } | null;
  onWeightPreviewChange: (val: { family: string; weight: number } | null) => void;
}) {
  const licenseColor = LICENSE_COLORS[font.license] || LICENSE_COLORS.unknown;
  const categoryLabel =
    font.category === "system"
      ? "시스템"
      : font.category === "broadcast"
        ? "방송용"
        : "커스텀";

  // 이 카드에 활성화된 weight 미리보기가 있는지 확인
  const activeWeight =
    activeWeightPreview?.family === font.family
      ? activeWeightPreview.weight
      : null;

  // weight 태그 클릭 핸들러
  const handleWeightClick = (w: number) => {
    if (activeWeight === w) {
      // 같은 태그 재클릭 → 초기화 (토글)
      onWeightPreviewChange(null);
    } else {
      onWeightPreviewChange({ family: font.family, weight: w });
    }
  };

  return (
    <div
      style={{
        ...cardStyle,
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
      }}
    >
      {/* 헤더: 이름 + 배지 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {font.label}
          </h3>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              margin: "0.25rem 0 0",
              fontFamily: `"${font.family}", sans-serif`,
            }}
          >
            {font.family}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          {/* 한글 배지 */}
          {font.isKorean && (
            <span
              style={{
                padding: "0.125rem 0.5rem",
                borderRadius: "999px",
                fontSize: "0.65rem",
                fontWeight: 600,
                background: "rgba(234, 88, 12, 0.15)",
                color: "#f97316",
              }}
            >
              🇰🇷 한글
            </span>
          )}
          <span
            style={{
              padding: "0.125rem 0.5rem",
              borderRadius: "999px",
              fontSize: "0.65rem",
              fontWeight: 600,
              background: `${licenseColor}20`,
              color: licenseColor,
            }}
          >
            {font.license}
          </span>
          <span
            style={{
              padding: "0.125rem 0.5rem",
              borderRadius: "999px",
              fontSize: "0.65rem",
              fontWeight: 500,
              background: "rgba(255,255,255,0.06)",
              color: "var(--text-secondary)",
            }}
          >
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* 미리보기 텍스트 — weight 클릭 시 즉시 반영 */}
      <div
        style={{
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "rgba(0,0,0,0.2)",
          fontFamily: `"${font.family}", sans-serif`,
          fontSize: "1.1rem",
          lineHeight: 1.6,
          color: "var(--text-primary)",
          fontWeight: activeWeight ?? 400,
          transition: "font-weight 0.2s ease",
        }}
      >
        {font.previewText}
      </div>

      {/* Weight 태그 — 클릭 가능한 버튼 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.25rem",
        }}
      >
        {font.weights.map((w) => {
          const isActive = activeWeight === w;
          return (
            <button
              key={w}
              type="button"
              onClick={() => handleWeightClick(w)}
              style={{
                padding: "0.125rem 0.5rem",
                borderRadius: "0.25rem",
                fontSize: "0.65rem",
                border: isActive
                  ? "1px solid var(--accent-primary)"
                  : "1px solid transparent",
                background: isActive
                  ? "rgba(99, 102, 241, 0.2)"
                  : "rgba(255,255,255,0.06)",
                color: isActive
                  ? "var(--accent-primary)"
                  : "var(--text-secondary)",
                fontFamily: `"${font.family}", sans-serif`,
                fontWeight: w,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {w} {WEIGHT_LABELS[w] || ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 업로드 폰트 카드 ─────────────────────────────────────────────

interface UploadedFontCardProps {
  family: ReturnType<typeof groupByFamily>[number];
  isOwner: (font: FontItem) => boolean;
  onDelete: (font: FontItem) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  formatFileSize: (bytes: number | null) => string;
  getWeightLabel: (weight: number) => string;
}

function UploadedFontCard({
  family,
  isOwner,
  onDelete,
  deleteConfirm,
  setDeleteConfirm,
  formatFileSize,
  getWeightLabel,
}: UploadedFontCardProps) {
  const licenseColor =
    LICENSE_COLORS[family.variants[0]?.license_type] || LICENSE_COLORS.unknown;

  return (
    <div style={cardStyle}>
      {/* 헤더 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "0.95rem",
              fontWeight: 600,
              margin: 0,
            }}
          >
            {family.displayName}
          </h3>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
              margin: "0.25rem 0 0",
            }}
          >
            {family.familyName} · {family.variants.length}개 variant
          </p>
        </div>
        <span
          style={{
            padding: "0.125rem 0.5rem",
            borderRadius: "999px",
            fontSize: "0.65rem",
            fontWeight: 600,
            background: `${licenseColor}20`,
            color: licenseColor,
          }}
        >
          {family.variants[0]?.license_type || "unknown"}
        </span>
      </div>

      {/* 미리보기 */}
      <div
        style={{
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "rgba(0,0,0,0.2)",
          fontFamily: `"${family.familyName}", sans-serif`,
          fontSize: "1.1rem",
          lineHeight: 1.6,
        }}
      >
        가나다라 ABCDE 12345
      </div>

      {/* Variant 목록 */}
      {family.variants.map((variant) => (
        <div
          key={variant.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.375rem",
            background: "rgba(255,255,255,0.03)",
            fontSize: "0.8rem",
          }}
        >
          <span
            style={{
              fontFamily: `"${family.familyName}", sans-serif`,
              fontWeight: variant.weight,
              fontStyle: variant.style,
            }}
          >
            {getWeightLabel(variant.weight)}{" "}
            {variant.style === "italic" ? "(Italic)" : ""}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
              }}
            >
              {formatFileSize(variant.file_size)}
            </span>
            {isOwner(variant) && (
              <>
                {deleteConfirm === variant.id ? (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onDelete(variant)}
                      style={{
                        background: "#ef4444",
                        border: "none",
                        color: "white",
                        borderRadius: "0.25rem",
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                      }}
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        border: "none",
                        color: "var(--text-secondary)",
                        borderRadius: "0.25rem",
                        padding: "0.125rem 0.5rem",
                        fontSize: "0.7rem",
                        cursor: "pointer",
                      }}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(variant.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      padding: "0.125rem",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
