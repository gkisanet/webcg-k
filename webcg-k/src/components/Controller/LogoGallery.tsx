/**
 * LogoGallery — 타임라인 좌측 접이식 로고 이미지 갤러리
 *
 * ■ Why images 테이블 직접 조회?
 *   로고는 이미지 갤러리(/dashboard/images)에서 등록된 에셋을 재사용한다.
 *   하드코딩된 KBS 로고 데이터 대신, images 테이블의 실제 이미지를
 *   카테고리별로 조회하여 로고 트랙에 임포트할 수 있도록 한다.
 *   category 필드가 null인 이미지는 "전체" 탭에서 표시.
 */

import { ChevronLeft, ChevronRight, Image, Search, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SNAP_UNIT } from "../../stores/blockManipulation";
import { timelineStore } from "../../stores/timelineStore";
import { fetchImages, type ImageItem } from "../../services/imageService";

interface LogoGalleryProps {
    isOpen: boolean;
    onToggle: () => void;
}


export function LogoGallery({ isOpen, onToggle }: LogoGalleryProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // ■ DB에서 이미지 목록 조회 (images 테이블)
    const [images, setImages] = useState<ImageItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ■ 카테고리 목록: 이미지의 category 필드에서 동적 추출
    const [categories, setCategories] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return; // 닫혀있으면 로드하지 않음 (불필요한 요청 방지)

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetchImages()
            .then((data) => {
                if (cancelled) return;
                setImages(data);

                // 1. 카테고리 추출 (null 제외, 중복 제거)
                const cats = [...new Set(
                    data
                        .map((img) => img.category)
                        .filter((c): c is string => c !== null && c !== ""),
                )];
                setCategories(cats);
            })
            .catch((err) => {
                if (cancelled) return;
                setError(err.message || "이미지 로드 실패");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [isOpen]);

    // 카테고리 필터 + 검색
    const filteredImages = images.filter((img) => {
        // 2. 카테고리 필터: "전체" 탭(null) → 전부, 그 외 → 일치
        const matchesCategory = selectedCategory === null || img.category === selectedCategory;
        // 3. 검색: 이름 + 키워드 매칭
        const matchesSearch = !searchQuery ||
            img.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (img.description?.toLowerCase().includes(searchQuery.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    // ■ 이미지를 로고 트랙에 임포트
    // Why? 로고 트랙은 전용 UI(LogoGallery)를 통해서만 블록 추가/제거 가능 (단일 진입점)
    const handleImportLogo = useCallback((img: ImageItem) => {
        const state = timelineStore.state;
        const logoTrack = state.tracks.find((t) => t.isLogoTrack);
        if (!logoTrack) return;

        // 모든 비로고 블록의 최대 끝 위치 계산 → 로고 블록 너비
        const nonLogoBlocks = state.blocks.filter((b) => b.trackId !== logoTrack.id);
        const maxEnd = nonLogoBlocks.reduce(
            (max, b) => Math.max(max, b.startPosition + b.width),
            SNAP_UNIT * 6, // 최소 300px
        );

        // ■ 위치 정보 파싱 (SVG 생성 시 그리드 위치를 저장했을 경우)
        let imageX: number | undefined;
        let imageY: number | undefined;
        let imageW: number | undefined;
        let imageH: number | undefined;

        if (img.keywords) {
            const xKw = img.keywords.find(k => k.startsWith("_posX:"));
            const yKw = img.keywords.find(k => k.startsWith("_posY:"));
            const wKw = img.keywords.find(k => k.startsWith("_posW:"));
            const hKw = img.keywords.find(k => k.startsWith("_posH:"));

            if (xKw && yKw) {
                imageX = Number(xKw.split(":")[1]);
                imageY = Number(yKw.split(":")[1]);
            }
            if (wKw && hKw) {
                imageW = Number(wKw.split(":")[1]);
                imageH = Number(hKw.split(":")[1]);
            }
        }

        // 기존 로고 트랙 블록 교체 또는 추가
        const existingLogoBlock = state.blocks.find((b) => b.trackId === logoTrack.id);
        const newBlock = {
            id: `logo-block-${Date.now()}`,
            name: img.name,
            trackId: logoTrack.id,
            startPosition: SNAP_UNIT, // 예약 영역(50px) 이후
            width: maxEnd - SNAP_UNIT,
            color: "rgba(251, 191, 36, 0.6)", // 로고 트랙 기본 색상 (골드)
            transitionIn: "cut" as const,
            transitionOut: "cut" as const,
            sourceType: "image" as const,
            sourceId: img.id,
            // ■ 이미지 URL 및 위치 정보를 sourceData에 포함
            sourceData: {
                imageUrl: img.url_2k || img.url_4k || null,
                imageName: img.name,
                imageX,
                imageY,
                imageW,
                imageH,
            },
        };

        timelineStore.setState((s) => ({
            ...s,
            blocks: existingLogoBlock
                ? s.blocks.map((b) => (b.trackId === logoTrack.id ? newBlock : b))
                : [...s.blocks, newBlock],
        }));
    }, []);

    return (
        <div
            className="logo-gallery"
            style={{
                width: isOpen ? "200px" : "0px",
                minWidth: isOpen ? "200px" : "0px",
                transition: "all 0.2s ease",
                overflow: "hidden",
                borderRight: isOpen ? "1px solid var(--border-default)" : "none",
                background: "var(--app-bg-alt)",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* 갤러리 헤더 */}
            <div
                style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                }}
            >
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Image size={14} />
                    로고 갤러리
                </span>
                <button
                    type="button"
                    onClick={onToggle}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px",
                        color: "var(--text-tertiary)",
                        display: "flex",
                    }}
                    title="갤러리 접기"
                >
                    <ChevronLeft size={14} />
                </button>
            </div>

            {/* 검색 */}
            <div style={{ padding: "6px 10px" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        background: "var(--app-bg-muted)",
                        borderRadius: "4px",
                        fontSize: "0.6875rem",
                    }}
                >
                    <Search size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            background: "transparent",
                            border: "none",
                            outline: "none",
                            color: "var(--text-primary)",
                            fontSize: "0.6875rem",
                            width: "100%",
                        }}
                    />
                </div>
            </div>

            {/* 카테고리 탭 — DB에서 동적 생성 */}
            <div style={{ padding: "0 10px 6px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                {/* "전체" 탭 */}
                <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    style={{
                        padding: "2px 8px",
                        fontSize: "0.625rem",
                        fontWeight: 500,
                        border: "none",
                        borderRadius: "3px",
                        cursor: "pointer",
                        background: selectedCategory === null ? "var(--accent-primary)" : "var(--app-bg-muted)",
                        color: selectedCategory === null ? "white" : "var(--text-secondary)",
                        transition: "all 0.15s",
                    }}
                >
                    📁 전체
                </button>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        style={{
                            padding: "2px 8px",
                            fontSize: "0.625rem",
                            fontWeight: 500,
                            border: "none",
                            borderRadius: "3px",
                            cursor: "pointer",
                            background: selectedCategory === cat ? "var(--accent-primary)" : "var(--app-bg-muted)",
                            color: selectedCategory === cat ? "white" : "var(--text-secondary)",
                            transition: "all 0.15s",
                        }}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* 이미지 목록 */}
            <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
                {/* 로딩 상태 */}
                {loading && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-tertiary)" }}>
                        <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                        <div style={{ fontSize: "0.6875rem" }}>이미지 로딩 중...</div>
                    </div>
                )}

                {/* 에러 상태 */}
                {error && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--accent-danger)", fontSize: "0.6875rem" }}>
                        ⚠️ {error}
                    </div>
                )}

                {/* 빈 상태 */}
                {!loading && !error && filteredImages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-tertiary)", fontSize: "0.6875rem" }}>
                        {images.length === 0
                            ? "등록된 이미지가 없습니다.\n이미지 갤러리에서 먼저 추가하세요."
                            : "검색 결과 없음"}
                    </div>
                )}

                {/* 이미지 카드 목록 */}
                {!loading && !error && filteredImages.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {filteredImages.map((img) => (
                            <button
                                key={img.id}
                                type="button"
                                onClick={() => handleImportLogo(img)}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "6px 8px",
                                    background: "var(--app-bg-muted)",
                                    border: "1px solid var(--border-subtle)",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    transition: "all 0.15s",
                                    textAlign: "left",
                                }}
                                title={`${img.name} 임포트`}
                            >
                                {/* ■ 실제 이미지 썸네일 — Storage URL 사용 */}
                                <div
                                    style={{
                                        width: "36px",
                                        height: "36px",
                                        borderRadius: "3px",
                                        background: "rgba(0,0,0,0.3)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        flexShrink: 0,
                                        overflow: "hidden",
                                    }}
                                >
                                    {(img.url_2k || img.url_4k) ? (
                                        <img
                                            src={img.url_2k || img.url_4k || ""}
                                            alt={img.name}
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                objectFit: "cover",
                                            }}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <Image size={14} style={{ color: "var(--text-tertiary)" }} />
                                    )}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{
                                        fontSize: "0.6875rem",
                                        fontWeight: 600,
                                        color: "var(--text-primary)",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}>
                                        {img.name}
                                    </div>
                                    <div style={{ fontSize: "0.5625rem", color: "var(--text-tertiary)" }}>
                                        {img.category || "분류 없음"}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

/** 접기 상태일 때 보이는 세로 전체 손잡이 바 */
export function LogoGalleryToggle({ onClick }: { onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: "16px",
                minWidth: "16px",
                height: "100%",
                alignSelf: "stretch",
                zIndex: 10,
                background: "var(--app-bg-raised)",
                border: "none",
                borderRight: "1px solid var(--border-default)",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                color: "rgba(251, 191, 36, 0.7)",
                transition: "background 0.15s",
            }}
            title="로고 갤러리 열기"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--app-bg-muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--app-bg-raised)"; }}
        >
            <ChevronRight size={10} />
        </button>
    );
}
