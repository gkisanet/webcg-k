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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("fonts");
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
        `${t("alerts.uploadFailed")}: ${err instanceof Error ? err.message : t("alerts.unknownError")}`,
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
      alert(t("alerts.deleteFailed"));
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
            {t("pageTitle")}
          </div>
          <div className="dash-page-subtitle">
            {t("pageSubtitle", { count: SYSTEM_FONTS.length })}
          </div>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn primary" onClick={openUploadModal}>
            <Upload size={16} /> {t("upload")}
          </button>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="dash-filter-group">
        <button
          className={`dash-filter-btn ${selectedCategory === null ? "active" : ""}`}
          onClick={() => setSelectedCategory(null)}
        >
          {t("all")}
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`dash-filter-btn ${selectedCategory === cat ? "active" : ""}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === "system"
              ? t("categories.system")
              : cat === "broadcast"
                ? t("categories.broadcast")
                : t("categories.custom")}
          </button>
        ))}
        {/* 한글 전용 필터 */}
        <button
          className={`dash-filter-btn ${selectedCategory === "korean" ? "active" : ""}`}
          onClick={() => setSelectedCategory("korean")}
          style={{ gap: "0.25rem" }}
        >
          {t("isKorean")}
        </button>
      </div>

      {/* ─── 시스템 번들 폰트 섹션 ─── */}
      {(selectedCategory === null || selectedCategory === "system" || selectedCategory === "broadcast" || selectedCategory === "korean") && (
        <>
          <div className="dash-card-name" style={{ fontSize: 15, marginBottom: 12 }}>
            <Shield size={16} />
            {t("systemBundleTitle", { count: SYSTEM_FONTS.filter(f => {
              if (selectedCategory === "korean") return f.isKorean;
              return selectedCategory === null || f.category === selectedCategory;
            }).length })}
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
            {t("uploadedFontsTitle", { count: fontFamilies.length })}
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
          <div className="dash-empty-title">{t("noFonts")}</div>
          <div className="dash-empty-desc">
            {t("uploadEmptyDesc")}
          </div>
          <button className="dash-btn primary" onClick={openUploadModal}>
            <Upload size={16} /> {t("upload")}
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
          {t("licenseGuide")}
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
              {t(`licenseColors.${label}`, label)}
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
          {t("licenseWarning")}
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
                {t("modal.title")}
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
                {t("modal.familyName")}
                <input
                  type="text"
                  value={uploadModal.familyName}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      familyName: e.target.value,
                    }))
                  }
                  placeholder={t("modal.familyNamePlaceholder")}
                  style={inputStyle}
                />
              </label>

              {/* 표시 이름 */}
              <label style={labelStyle}>
                {t("modal.displayName")}
                <input
                  type="text"
                  value={uploadModal.displayName}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      displayName: e.target.value,
                    }))
                  }
                  placeholder={t("modal.displayNamePlaceholder")}
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
                  {t("modal.weight")}
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
                  {t("modal.style")}
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
                    <option value="normal">{t("modal.styleNormal")}</option>
                    <option value="italic">{t("modal.styleItalic")}</option>
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
                  {t("modal.category")}
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
                    <option value="broadcast">{t("categories.broadcast")}</option>
                    <option value="custom">{t("categories.custom")}</option>
                  </select>
                </label>

                <label style={labelStyle}>
                  {t("modal.license")}
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
                    <option value="OFL">{t("modal.licenseOfl")}</option>
                    <option value="Apache 2.0">{t("modal.licenseApache")}</option>
                    <option value="Commercial">{t("modal.licenseCommercial")}</option>
                    <option value="unknown">{t("modal.licenseUnknown")}</option>
                  </select>
                </label>
              </div>

              {/* 라이선스 메모 */}
              <label style={labelStyle}>
                {t("modal.licenseNotes")}
                <input
                  type="text"
                  value={uploadModal.licenseNotes}
                  onChange={(e) =>
                    setUploadModal((s) => ({
                      ...s,
                      licenseNotes: e.target.value,
                    }))
                  }
                  placeholder={t("modal.licenseNotesPlaceholder")}
                  style={inputStyle}
                />
              </label>

              {/* 파일 선택 */}
              <label style={labelStyle}>
                {t("modal.fontFile")}
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
                  {t("modal.selected")}: {uploadModal.file.name} (
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
                {t("modal.cancel")}
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
                {uploading ? t("modal.uploading") : t("modal.upload")}
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
  const { t } = useTranslation("fonts");
  const licenseColor = LICENSE_COLORS[font.license] || LICENSE_COLORS.unknown;
  const categoryLabel =
    font.category === "system"
      ? t("categories.system")
      : font.category === "broadcast"
        ? t("categories.broadcast")
        : t("categories.custom");

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
            {t(`systemFonts.${font.family}.label`, font.label)}
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
              {t("isKorean")}
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
        {t(`systemFonts.${font.family}.previewText`, font.previewText)}
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
  const { t } = useTranslation("fonts");
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
            {family.familyName} · {t("variantsCount", { count: family.variants.length })}
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
        {t("sampleText")}
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
                      {t("confirm")}
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
                      {t("cancel")}
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
