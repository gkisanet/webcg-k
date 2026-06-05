/**
 * NRCS 연동 탭 패널
 * datasources.tsx에서 분리 — NRCS 필터바/프로그램/기사/CG 텍스트 UI
 */

import {
    Calendar,
    ChevronDown,
    ChevronRight,
    FileText,
    Loader2,
    MapPin,
    Tag,
    Tv,
    User,
} from "lucide-react";
import {
    BUREAUS,
    CG_TYPE_LABELS,
    CG_TYPE_COLORS,
    ARTICLE_TYPE_LABELS,
    type BureauCode,
    type NewsProgram,
    type NrcsNewsItem,
} from "../../../lib/nrcsTypes";

// ─── Props ──────────────────────────────────────────────────────

interface NrcsPanelProps {
    nrcsDate: string;
    setNrcsDate: (date: string) => void;
    nrcsBureau: BureauCode;
    setNrcsBureau: (bureau: BureauCode) => void;
    nrcsPrograms: NewsProgram[];
    nrcsProgramsLoading: boolean;
    selectedProgramId: string | null;
    setSelectedProgramId: (id: string | null) => void;
    nrcsItems: NrcsNewsItem[];
    nrcsItemsLoading: boolean;
    expandedItemId: string | null;
    setExpandedItemId: (id: string | null) => void;
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function NrcsPanel({
    nrcsDate,
    setNrcsDate,
    nrcsBureau,
    setNrcsBureau,
    nrcsPrograms,
    nrcsProgramsLoading,
    selectedProgramId,
    setSelectedProgramId,
    nrcsItems,
    nrcsItemsLoading,
    expandedItemId,
    setExpandedItemId,
}: NrcsPanelProps) {
    return (
        <div className="nrcs-panel">
            {/* 상단 필터 바 */}
            <div className="nrcs-filter-bar">
                <div className="nrcs-filter-group">
                    <label className="nrcs-filter-label">
                        <Calendar size={14} />
                        날짜
                    </label>
                    <input
                        type="date"
                        className="nrcs-date-input"
                        value={nrcsDate}
                        onChange={(e) => setNrcsDate(e.target.value)}
                    />
                </div>
                <div className="nrcs-filter-group">
                    <label className="nrcs-filter-label">
                        <MapPin size={14} />
                        총국
                    </label>
                    <div className="nrcs-bureau-chips">
                        {BUREAUS.map((b) => (
                            <button
                                key={b.code}
                                type="button"
                                className={`nrcs-bureau-chip ${nrcsBureau === b.code ? "active" : ""}`}
                                onClick={() => setNrcsBureau(b.code)}
                                title={b.region}
                            >
                                {b.code === "HQ" ? "🏢 본사" : b.name.replace("총국", "")}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* 2컬럼 레이아웃: 프로그램 리스트 | 기사 리스트 */}
            <div className="nrcs-content-grid">
                {/* 왼쪽: 뉴스 프로그램 리스트 */}
                <div className="nrcs-programs-panel">
                    <div className="nrcs-panel-title">
                        <Tv size={16} />
                        뉴스 프로그램
                        <span className="nrcs-count-badge">{nrcsPrograms.length}</span>
                    </div>
                    {nrcsProgramsLoading ? (
                        <div className="nrcs-loading">
                            <Loader2 className="animate-spin" size={24} />
                            <span>프로그램 불러오는 중...</span>
                        </div>
                    ) : nrcsPrograms.length === 0 ? (
                        <div className="nrcs-empty">해당 날짜의 프로그램이 없습니다.</div>
                    ) : (
                        <div className="nrcs-program-list">
                            {nrcsPrograms.map((prog) => (
                                <button
                                    key={prog.id}
                                    type="button"
                                    className={`nrcs-program-card ${selectedProgramId === prog.id ? "active" : ""
                                        }`}
                                    onClick={() => setSelectedProgramId(prog.id)}
                                >
                                    <div className="nrcs-prog-time">{prog.airTime}</div>
                                    <div className="nrcs-prog-info">
                                        <div className="nrcs-prog-name">{prog.name}</div>
                                        <div className="nrcs-prog-meta">
                                            <span>{prog.itemCount}개 기사</span>
                                            <span>•</span>
                                            <span>{prog.duration}분</span>
                                        </div>
                                    </div>
                                    <div className={`nrcs-prog-status status-${prog.status}`}>
                                        {prog.status === "editing" && "편집중"}
                                        {prog.status === "ready" && "준비"}
                                        {prog.status === "onair" && "🔴 ON AIR"}
                                        {prog.status === "done" && "완료"}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* 오른쪽: 기사 아이템 리스트 */}
                <div className="nrcs-items-panel">
                    <div className="nrcs-panel-title">
                        <FileText size={16} />
                        기사 아이템
                        {nrcsItems.length > 0 && (
                            <span className="nrcs-count-badge">{nrcsItems.length}</span>
                        )}
                    </div>
                    {!selectedProgramId ? (
                        <div className="nrcs-empty">
                            <Tv size={32} style={{ opacity: 0.3 }} />
                            <span>왼쪽에서 프로그램을 선택하세요</span>
                        </div>
                    ) : nrcsItemsLoading ? (
                        <div className="nrcs-loading">
                            <Loader2 className="animate-spin" size={24} />
                            <span>기사 불러오는 중...</span>
                        </div>
                    ) : (
                        <div className="nrcs-item-list">
                            {nrcsItems.map((item, idx) => (
                                <div key={item.id} className="nrcs-item-card">
                                    {/* 기사 헤더 (클릭하면 확장) */}
                                    <button
                                        type="button"
                                        className={`nrcs-item-header ${expandedItemId === item.id ? "expanded" : ""
                                            }`}
                                        onClick={() =>
                                            setExpandedItemId(
                                                expandedItemId === item.id ? null : item.id,
                                            )
                                        }
                                    >
                                        <span className="nrcs-item-order">{idx + 1}</span>
                                        {expandedItemId === item.id ? (
                                            <ChevronDown size={14} />
                                        ) : (
                                            <ChevronRight size={14} />
                                        )}
                                        <span className={`nrcs-article-type type-${item.articleType}`}>
                                            {ARTICLE_TYPE_LABELS[item.articleType]}
                                        </span>
                                        <span className="nrcs-item-title">{item.title}</span>
                                        <span className={`nrcs-item-status status-${item.status}`}>
                                            {item.status === "editing" ? "편집중" : item.status === "ready" ? "준비" : "승인"}
                                        </span>
                                        <span className="nrcs-item-duration">
                                            {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, "0")}
                                        </span>
                                        <span className="nrcs-cg-count">
                                            <Tag size={12} />
                                            {item.cgTexts.length}
                                        </span>
                                    </button>

                                    {/* 확장 영역: 기사 상세 + CG 텍스트 */}
                                    {expandedItemId === item.id && (
                                        <div className="nrcs-item-detail">
                                            {/* 기자 정보 */}
                                            <div className="nrcs-reporter-info">
                                                <User size={14} />
                                                <span className="nrcs-reporter-name">{item.reporter}</span>
                                                <span className="nrcs-reporter-dept">{item.department}</span>
                                                <span className="nrcs-item-slug">{item.slug}</span>
                                            </div>

                                            {/* 기사 본문 */}
                                            <div className="nrcs-body-text">
                                                {item.bodyText}
                                            </div>

                                            {/* CG 텍스트 목록 */}
                                            <div className="nrcs-cg-section">
                                                <div className="nrcs-cg-title">
                                                    <Tag size={14} />
                                                    CG 텍스트 ({item.cgTexts.length}개)
                                                </div>
                                                <div className="nrcs-cg-list">
                                                    {item.cgTexts.map((cg) => (
                                                        <div key={cg.id} className="nrcs-cg-item">
                                                            <span
                                                                className="nrcs-cg-type-badge"
                                                                style={{
                                                                    background: CG_TYPE_COLORS[cg.type] + "22",
                                                                    color: CG_TYPE_COLORS[cg.type],
                                                                    borderColor: CG_TYPE_COLORS[cg.type] + "44",
                                                                }}
                                                            >
                                                                {CG_TYPE_LABELS[cg.type]}
                                                            </span>
                                                            <div className="nrcs-cg-fields">
                                                                {Object.entries(cg.fields).map(
                                                                    ([key, val]) => (
                                                                        <div
                                                                            key={key}
                                                                            className="nrcs-cg-field"
                                                                        >
                                                                            <span className="nrcs-cg-field-key">
                                                                                {key === "text" ? "텍스트" :
                                                                                    key === "personName" ? "이름" :
                                                                                        key === "personTitle" ? "직함" :
                                                                                            key}
                                                                            </span>
                                                                            <span className="nrcs-cg-field-val">
                                                                                {val}
                                                                            </span>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
