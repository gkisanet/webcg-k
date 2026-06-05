/**
 * 데이터 소스 관리 페이지 — Lazy 로드 컴포넌트
 * 코드 스플리팅: 이 파일은 라우트 접근 시에만 로드됩니다
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomSources, saveCustomSource as saveSource, deleteCustomSource as deleteSource, updateSourceTestStatus } from "../../../services/dataSourceService";
import {
    Database,
    Zap,
    Radio,
    X,
    Plus,
    Trash2,
    Clock,
    CheckCircle,
    AlertCircle,
    Loader2,
    Edit3,
    Globe,
    ChevronDown,
    ChevronRight,
    FileText,
    Calendar,
    MapPin,
    Tv,
    User,
    Tag,
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
import { fetchNewsPrograms, fetchNewsItems } from "../../../services/nrcsService";
import { useAuth } from "../../../lib/auth";
import {
    testDataSource,
    fetchCustomSource,
    type DataSourceTestResult,
} from "../../../services/dataProviders";
import type { CustomDataSource } from "../../../lib/overlayTypes";
import "./index.css";

export const Route = createLazyFileRoute("/dashboard/datasources/")({
    component: DataSourcesPage,
});

// ─── 상수 ─────────────────────────────────────────────────────────

/** 탭 종류 */
type TabType = "live-sources" | "nrcs";

/** 빌트인 데이터 소스 카드 정의 */
interface SourceCardDef {
    type: string;
    icon: string;
    title: string;
    provider: string;
    description: string;
    tags: Array<{ label: string; class: string }>;
    accent: string;
    hasCity?: boolean;
    isBuiltIn: true;
}

/** 한국 주요 도시 */
const KOREA_CITIES = ["서울", "부산", "대구", "인천", "광주", "대전", "제주"];

/** 빌트인 데이터 소스 목록 */
const BUILTIN_SOURCES: SourceCardDef[] = [
    {
        type: "weather",
        icon: "🌤",
        title: "실시간 날씨",
        provider: "Open-Meteo API",
        description: "현재 기온, 날씨 상태, 습도, 풍속 데이터를 실시간으로 가져옵니다.",
        tags: [
            { label: "무료", class: "free" },
            { label: "인증 불필요", class: "free" },
        ],
        accent: "rgba(96, 165, 250, 0.5)",
        hasCity: true,
        isBuiltIn: true,
    },
    {
        type: "earthquake",
        icon: "🌍",
        title: "지진 정보",
        provider: "USGS Earthquake API",
        description: "최근 24시간 동아시아(한반도 근처) M2.5+ 지진 데이터를 조회합니다.",
        tags: [
            { label: "무료", class: "free" },
            { label: "인증 불필요", class: "free" },
        ],
        accent: "rgba(245, 158, 11, 0.5)",
        isBuiltIn: true,
    },
    {
        type: "wildfire",
        icon: "🔥",
        title: "산불 현황",
        provider: "공공데이터 (Mock)",
        description: "전국 산불 발생 현황 및 진화 상태를 표시합니다. 현재 Mock 데이터 사용.",
        tags: [
            { label: "Mock", class: "mock" },
            { label: "추후 연동", class: "" },
        ],
        accent: "rgba(239, 68, 68, 0.5)",
        isBuiltIn: true,
    },
    {
        type: "public_data",
        icon: "📊",
        title: "공공 데이터",
        provider: "JSONPlaceholder (Mock)",
        description: "뉴스/SNS 스타일의 텍스트 게시물 데이터를 조회합니다.",
        tags: [
            { label: "Mock", class: "mock" },
            { label: "테스트용", class: "" },
        ],
        accent: "rgba(139, 92, 246, 0.5)",
        isBuiltIn: true,
    },
];

// ─── 이모지 아이콘 선택지 ──────────────────────────────────────
const ICON_OPTIONS = ["🔗", "📡", "📊", "🌐", "⚡", "🏢", "📰", "🎯", "💹", "🛰️", "📈", "🗂️"];

// ─── 악센트 컬러 선택지 ────────────────────────────────────────
const ACCENT_OPTIONS = [
    "rgba(99, 102, 241, 0.5)",   // 인디고
    "rgba(236, 72, 153, 0.5)",   // 핑크
    "rgba(16, 185, 129, 0.5)",   // 에메랄드
    "rgba(245, 158, 11, 0.5)",   // 앰버
    "rgba(139, 92, 246, 0.5)",   // 바이올렛
    "rgba(6, 182, 212, 0.5)",    // 시안
    "rgba(239, 68, 68, 0.5)",    // 레드
    "rgba(132, 204, 22, 0.5)",   // 라임
];



// ─── 커스텀 소스 폼 초기값 ────────────────────────────────────────

interface CustomSourceForm {
    name: string;
    icon: string;
    provider: string;
    description: string;
    endpoint: string;
    method: "GET" | "POST";
    headers: Array<{ key: string; value: string }>;
    query_params: Array<{ key: string; value: string }>;
    auth_type: "none" | "api_key" | "bearer";
    accent: string;
}

const EMPTY_FORM: CustomSourceForm = {
    name: "",
    icon: "🔗",
    provider: "",
    description: "",
    endpoint: "",
    method: "GET",
    headers: [{ key: "", value: "" }],
    query_params: [{ key: "", value: "" }],
    auth_type: "none",
    accent: "rgba(99, 102, 241, 0.5)",
};

// ─── 헬퍼 ─────────────────────────────────────────────────────────

/** key-value 배열 → Record 변환 (빈 항목 제외) */
function kvToRecord(pairs: Array<{ key: string; value: string }>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const p of pairs) {
        if (p.key.trim()) result[p.key.trim()] = p.value;
    }
    return result;
}

/** Record → key-value 배열 변환 */
function recordToKv(record: Record<string, string> | null | undefined): Array<{ key: string; value: string }> {
    if (!record || Object.keys(record).length === 0) return [{ key: "", value: "" }];
    return Object.entries(record).map(([key, value]) => ({ key, value }));
}

// ─── 메인 컴포넌트 ───────────────────────────────────────────────

function DataSourcesPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<TabType>("live-sources");

    // 테스트 상태
    const [testingType, setTestingType] = useState<string | null>(null);
    const [testResult, setTestResult] = useState<DataSourceTestResult | null>(null);
    const [testSourceName, setTestSourceName] = useState<string>("");
    const [weatherCity, setWeatherCity] = useState("서울");

    // 커스텀 소스 상태
    const { data: customSources = [] } = useQuery({
        queryKey: ["custom_data_sources"],
        queryFn: () => fetchCustomSources<CustomDataSource>(),
        enabled: !!user,
    });

    const [showSourceModal, setShowSourceModal] = useState(false);
    const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
    const [sourceForm, setSourceForm] = useState<CustomSourceForm>({ ...EMPTY_FORM });
    const [sourceDeleteConfirm, setSourceDeleteConfirm] = useState<string | null>(null);

    // ─── NRCS 상태 ──────────────────────────────────────────────
    const todayStr = new Date().toISOString().slice(0, 10);
    const [nrcsDate, setNrcsDate] = useState(todayStr);
    const [nrcsBureau, setNrcsBureau] = useState<BureauCode>("HQ");
    const [nrcsPrograms, setNrcsPrograms] = useState<NewsProgram[]>([]);
    const [nrcsProgramsLoading, setNrcsProgramsLoading] = useState(false);
    const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
    const [nrcsItems, setNrcsItems] = useState<NrcsNewsItem[]>([]);
    const [nrcsItemsLoading, setNrcsItemsLoading] = useState(false);
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

    // NRCS 프로그램 로드
    useEffect(() => {
        if (activeTab !== "nrcs") return;
        let cancelled = false;
        setNrcsProgramsLoading(true);
        setSelectedProgramId(null);
        setNrcsItems([]);
        setExpandedItemId(null);
        fetchNewsPrograms(nrcsDate, nrcsBureau).then((data) => {
            if (!cancelled) {
                setNrcsPrograms(data);
                setNrcsProgramsLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [nrcsDate, nrcsBureau, activeTab]);

    // NRCS 기사 아이템 로드
    useEffect(() => {
        if (!selectedProgramId) return;
        let cancelled = false;
        setNrcsItemsLoading(true);
        setExpandedItemId(null);
        fetchNewsItems(selectedProgramId).then((data) => {
            if (!cancelled) {
                setNrcsItems(data);
                setNrcsItemsLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [selectedProgramId]);



    // ─── 커스텀 소스 CRUD ──────────────────────────────────────────

    // 커스텀 소스 저장 (생성/수정)
    const saveCustomSource = useCallback(async () => {
        if (!user || !sourceForm.name || !sourceForm.endpoint) return;

        const record = {
            owner_id: user.id,
            name: sourceForm.name,
            icon: sourceForm.icon,
            provider: sourceForm.provider || "커스텀 API",
            description: sourceForm.description || null,
            endpoint: sourceForm.endpoint,
            method: sourceForm.method,
            headers: kvToRecord(sourceForm.headers),
            query_params: kvToRecord(sourceForm.query_params),
            auth_type: sourceForm.auth_type,
            accent: sourceForm.accent,
        };

        try {
            await saveSource(record, editingSourceId);
            closeSourceModal();
            queryClient.invalidateQueries({ queryKey: ["custom_data_sources"] });
        } catch (err) {
            console.error("[DataSources] 커스텀 소스 저장 실패:", err);
            alert("소스 저장에 실패했습니다.");
        }
    }, [user, sourceForm, editingSourceId, queryClient]);

    // 커스텀 소스 삭제
    const deleteCustomSource = useCallback(
        async (id: string) => {
            try {
                await deleteSource(id);
                setSourceDeleteConfirm(null);
                queryClient.invalidateQueries({ queryKey: ["custom_data_sources"] });
            } catch (err) {
                console.error("[DataSources] 커스텀 소스 삭제 실패:", err);
            }
        },
        [queryClient],
    );

    // 모달 열기/닫기
    const openCreateModal = () => {
        setEditingSourceId(null);
        setSourceForm({ ...EMPTY_FORM });
        setShowSourceModal(true);
    };

    const openEditModal = (source: CustomDataSource) => {
        setEditingSourceId(source.id);
        setSourceForm({
            name: source.name,
            icon: source.icon,
            provider: source.provider,
            description: source.description || "",
            endpoint: source.endpoint,
            method: source.method,
            headers: recordToKv(source.headers),
            query_params: recordToKv(source.query_params),
            auth_type: source.auth_type,
            accent: source.accent,
        });
        setShowSourceModal(true);
    };

    const closeSourceModal = () => {
        setShowSourceModal(false);
        setEditingSourceId(null);
        setSourceForm({ ...EMPTY_FORM });
    };



    // ─── 데이터 소스 테스트 ───────────────────────────────────────

    // 빌트인 소스 테스트
    const handleBuiltinTest = useCallback(
        async (card: SourceCardDef) => {
            setTestingType(card.type);
            setTestResult(null);
            setTestSourceName(card.title);
            const params = card.type === "weather" ? { city: weatherCity } : undefined;
            const result = await testDataSource(card.type, params);
            setTestResult(result);
            setTestingType(null);
        },
        [weatherCity],
    );

    // 커스텀 소스 테스트
    const handleCustomTest = useCallback(async (source: CustomDataSource) => {
        setTestingType(`custom-${source.id}`);
        setTestResult(null);
        setTestSourceName(source.name);

        const start = performance.now();
        const timestamp = new Date().toISOString();

        try {
            const data = await fetchCustomSource(source);
            const latencyMs = Math.round(performance.now() - start);

            // DB에 last_tested/last_status 업데이트
            await updateSourceTestStatus(source.id, "200", timestamp);

            setTestResult({ status: 200, latencyMs, data, timestamp });
        } catch (err: unknown) {
            const latencyMs = Math.round(performance.now() - start);
            const message = err instanceof Error ? err.message : "알 수 없는 에러";
            const statusMatch = message.match(/(\d{3})/);
            const status = statusMatch ? parseInt(statusMatch[1], 10) : 500;

            await updateSourceTestStatus(source.id, String(status), timestamp);

            setTestResult({ status, latencyMs, data: null, error: message, timestamp });
        } finally {
            setTestingType(null);
            // 소스 목록 리로드 (last_tested 반영)
            queryClient.invalidateQueries({ queryKey: ["custom_data_sources"] });
        }
    }, [queryClient]);

    // ─── KV 페어 핸들러 ──────────────────────────────────────────

    const updateKvPair = (
        field: "headers" | "query_params",
        index: number,
        part: "key" | "value",
        val: string,
    ) => {
        setSourceForm((prev) => {
            const arr = [...prev[field]];
            arr[index] = { ...arr[index], [part]: val };
            return { ...prev, [field]: arr };
        });
    };

    const addKvPair = (field: "headers" | "query_params") => {
        setSourceForm((prev) => ({
            ...prev,
            [field]: [...prev[field], { key: "", value: "" }],
        }));
    };

    const removeKvPair = (field: "headers" | "query_params", index: number) => {
        setSourceForm((prev) => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index),
        }));
    };

    // ─── 전체 소스 카운트 ────────────────────────────────────────

    const totalSourceCount = BUILTIN_SOURCES.length + customSources.length;

    // ─── 렌더링 ──────────────────────────────────────────────────

    return (
        <div className="page-content">
            {/* 헤더 */}
            <div className="datasources-header">
                <div>
                    <div className="datasources-title">
                        <div className="datasources-title-icon">
                            <Database size={18} />
                        </div>
                        데이터 소스 관리
                    </div>
                    <div className="datasources-subtitle">
                        자동화 그래픽 생성에 필요한 외부 데이터 연동을 관리합니다
                    </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        className="btn-datasource-test"
                        style={{ flex: "none" }}
                        onClick={openCreateModal}
                    >
                        <Plus size={16} /> 소스 추가
                    </button>
                </div>
            </div>

            {/* 탭 */}
            <div className="datasources-tabs">
                <button
                    className={`datasources-tab ${activeTab === "live-sources" ? "active" : ""}`}
                    onClick={() => setActiveTab("live-sources")}
                >
                    <Zap size={14} />
                    라이브 소스
                    <span className="datasources-tab-badge">{totalSourceCount}</span>
                </button>

                <button
                    className={`datasources-tab ${activeTab === "nrcs" ? "active" : ""}`}
                    onClick={() => setActiveTab("nrcs")}
                >
                    <Radio size={14} />
                    NRCS 연동
                    <span className="datasources-tab-badge">🔒</span>
                </button>
            </div>

            {/* ─── 라이브 소스 탭 ─────────────────────────────────── */}
            {activeTab === "live-sources" && (
                <>
                    {/* 섹션: 빌트인 소스 */}
                    <div className="datasource-section-label">
                        ⚡ 빌트인 데이터 소스
                    </div>
                    <div className="datasource-cards">
                        {BUILTIN_SOURCES.map((card) => (
                            <div
                                key={card.type}
                                className="datasource-card"
                                style={{ "--card-accent": card.accent } as React.CSSProperties}
                            >
                                <div className="datasource-card-header">
                                    <span className="datasource-card-icon">{card.icon}</span>
                                    <div>
                                        <div className="datasource-card-title">{card.title}</div>
                                        <div className="datasource-card-provider">{card.provider}</div>
                                    </div>
                                </div>
                                <div className="datasource-card-desc">{card.description}</div>
                                <div className="datasource-card-meta">
                                    {card.tags.map((tag, i) => (
                                        <span key={i} className={`datasource-card-tag ${tag.class}`}>
                                            {tag.label}
                                        </span>
                                    ))}
                                </div>

                                {card.hasCity && (
                                    <select
                                        className="datasource-city-select"
                                        value={weatherCity}
                                        onChange={(e) => setWeatherCity(e.target.value)}
                                    >
                                        {KOREA_CITIES.map((city) => (
                                            <option key={city} value={city}>
                                                📍 {city}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                <div className="datasource-card-actions">
                                    <button
                                        className={`btn-datasource-test ${testingType === card.type ? "testing" : ""}`}
                                        onClick={() => handleBuiltinTest(card)}
                                        disabled={testingType !== null}
                                    >
                                        {testingType === card.type ? (
                                            <>
                                                <Loader2 size={14} />
                                                테스트 중...
                                            </>
                                        ) : (
                                            <>
                                                <Zap size={14} />
                                                🔌 API 테스트
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 섹션: 커스텀 소스 */}
                    <div className="datasource-section-label" style={{ marginTop: 24 }}>
                        <Globe size={14} style={{ verticalAlign: "middle", marginRight: 4 }} />
                        커스텀 데이터 소스 ({customSources.length})
                    </div>
                    <div className="datasource-cards">
                        {/* 등록된 커스텀 소스 카드들 */}
                        {customSources.map((source) => (
                            <div
                                key={source.id}
                                className="datasource-card custom"
                                style={{ "--card-accent": source.accent } as React.CSSProperties}
                            >
                                <div className="datasource-card-header">
                                    <span className="datasource-card-icon">{source.icon}</span>
                                    <div>
                                        <div className="datasource-card-title">{source.name}</div>
                                        <div className="datasource-card-provider">{source.provider}</div>
                                    </div>
                                </div>
                                <div className="datasource-card-desc">
                                    {source.description || source.endpoint}
                                </div>
                                <div className="datasource-card-meta">
                                    <span className="datasource-card-tag custom-tag">커스텀</span>
                                    <span className="datasource-card-tag">{source.method}</span>
                                    {source.last_status && (
                                        <span
                                            className={`datasource-card-tag ${source.last_status === 200 ? "free" : "mock"}`}
                                        >
                                            {source.last_status === 200 ? "✅ 정상" : `⚠ ${source.last_status}`}
                                        </span>
                                    )}
                                </div>

                                <div className="datasource-card-actions custom-actions">
                                    <button
                                        className={`btn-datasource-test ${testingType === `custom-${source.id}` ? "testing" : ""}`}
                                        onClick={() => handleCustomTest(source)}
                                        disabled={testingType !== null}
                                    >
                                        {testingType === `custom-${source.id}` ? (
                                            <>
                                                <Loader2 size={14} />
                                                테스트 중...
                                            </>
                                        ) : (
                                            <>
                                                <Zap size={14} />
                                                API 테스트
                                            </>
                                        )}
                                    </button>
                                    <button
                                        className="btn-datasource-edit"
                                        onClick={() => openEditModal(source)}
                                        title="편집"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                    {sourceDeleteConfirm === source.id ? (
                                        <>
                                            <button
                                                className="btn-datasource-delete confirm"
                                                onClick={() => deleteCustomSource(source.id)}
                                                title="삭제 확인"
                                            >
                                                <CheckCircle size={14} />
                                            </button>
                                            <button
                                                className="btn-datasource-edit"
                                                onClick={() => setSourceDeleteConfirm(null)}
                                                title="취소"
                                            >
                                                <X size={14} />
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            className="btn-datasource-delete"
                                            onClick={() => setSourceDeleteConfirm(source.id)}
                                            title="삭제"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* ➕ 소스 추가 카드 */}
                        <div className="datasource-card add-card" onClick={openCreateModal}>
                            <div className="add-card-content">
                                <Plus size={28} />
                                <div className="add-card-title">소스 추가</div>
                                <div className="add-card-desc">
                                    커스텀 API 엔드포인트를 등록하세요
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 테스트 결과 패널 */}
                    {testResult && (
                        <div className="test-result-panel">
                            <div className="test-result-header">
                                <div className="test-result-status">
                                    <div
                                        className={`test-result-badge ${testResult.error ? "error" : "success"}`}
                                    >
                                        {testResult.error ? (
                                            <AlertCircle size={14} />
                                        ) : (
                                            <CheckCircle size={14} />
                                        )}
                                        {testResult.status} {testResult.error ? "ERROR" : "OK"}
                                    </div>
                                    <div className="test-result-latency">
                                        <Clock size={12} />
                                        응답: <strong>{testResult.latencyMs}ms</strong>
                                    </div>
                                    <div className="test-result-latency">
                                        {testSourceName}
                                    </div>
                                    <div className="test-result-timestamp">
                                        {new Date(testResult.timestamp).toLocaleTimeString("ko-KR")}
                                    </div>
                                </div>
                                <button
                                    className="test-result-close"
                                    onClick={() => setTestResult(null)}
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {testResult.error ? (
                                <div className="test-result-error">
                                    ❌ {testResult.error}
                                </div>
                            ) : (
                                <div className="test-result-body">
                                    <pre className="test-result-json">
                                        {JSON.stringify(testResult.data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ─── NRCS 연동 탭 ────────────────────────────────── */}
            {activeTab === "nrcs" && (
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
            )}

            {/* ─── 커스텀 소스 등록/편집 모달 ────────────────────── */}
            {showSourceModal && (
                <div
                    className="apikey-modal-backdrop"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) closeSourceModal();
                    }}
                >
                    <div className="custom-source-modal">
                        <div className="custom-source-modal-header">
                            <h3>
                                <Globe size={16} />
                                {editingSourceId ? "소스 편집" : "커스텀 소스 추가"}
                            </h3>
                            <button className="overlay-wizard-close" onClick={closeSourceModal}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="custom-source-modal-body">
                            {/* 기본 정보 */}
                            <div className="csm-section">
                                <div className="csm-section-title">기본 정보</div>
                                <div className="csm-row">
                                    <div className="csm-field" style={{ flex: 1 }}>
                                        <label>이름 *</label>
                                        <input
                                            type="text"
                                            value={sourceForm.name}
                                            onChange={(e) =>
                                                setSourceForm((f) => ({ ...f, name: e.target.value }))
                                            }
                                            placeholder="예: 기상청 초단기실황"
                                        />
                                    </div>
                                    <div className="csm-field" style={{ width: 120 }}>
                                        <label>아이콘</label>
                                        <select
                                            value={sourceForm.icon}
                                            onChange={(e) =>
                                                setSourceForm((f) => ({ ...f, icon: e.target.value }))
                                            }
                                        >
                                            {ICON_OPTIONS.map((icon) => (
                                                <option key={icon} value={icon}>
                                                    {icon}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="csm-row">
                                    <div className="csm-field" style={{ flex: 1 }}>
                                        <label>제공자명</label>
                                        <input
                                            type="text"
                                            value={sourceForm.provider}
                                            onChange={(e) =>
                                                setSourceForm((f) => ({ ...f, provider: e.target.value }))
                                            }
                                            placeholder="예: data.go.kr"
                                        />
                                    </div>
                                    <div className="csm-field" style={{ width: 120 }}>
                                        <label>악센트 컬러</label>
                                        <div className="accent-picker">
                                            {ACCENT_OPTIONS.map((color) => (
                                                <button
                                                    key={color}
                                                    className={`accent-dot ${sourceForm.accent === color ? "selected" : ""}`}
                                                    style={{ background: color }}
                                                    onClick={() =>
                                                        setSourceForm((f) => ({ ...f, accent: color }))
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="csm-field">
                                    <label>설명</label>
                                    <textarea
                                        value={sourceForm.description}
                                        onChange={(e) =>
                                            setSourceForm((f) => ({ ...f, description: e.target.value }))
                                        }
                                        placeholder="이 데이터 소스에 대한 간단한 설명"
                                        rows={2}
                                    />
                                </div>
                            </div>

                            {/* API 설정 */}
                            <div className="csm-section">
                                <div className="csm-section-title">API 설정</div>
                                <div className="csm-row">
                                    <div className="csm-field" style={{ width: 100 }}>
                                        <label>메서드</label>
                                        <select
                                            value={sourceForm.method}
                                            onChange={(e) =>
                                                setSourceForm((f) => ({
                                                    ...f,
                                                    method: e.target.value as "GET" | "POST",
                                                }))
                                            }
                                        >
                                            <option value="GET">GET</option>
                                            <option value="POST">POST</option>
                                        </select>
                                    </div>
                                    <div className="csm-field" style={{ flex: 1 }}>
                                        <label>API URL *</label>
                                        <input
                                            type="text"
                                            value={sourceForm.endpoint}
                                            onChange={(e) =>
                                                setSourceForm((f) => ({ ...f, endpoint: e.target.value }))
                                            }
                                            placeholder="https://api.example.com/v1/data"
                                        />
                                    </div>
                                </div>
                                <div className="csm-field" style={{ width: 160 }}>
                                    <label>인증 방식</label>
                                    <select
                                        value={sourceForm.auth_type}
                                        onChange={(e) =>
                                            setSourceForm((f) => ({
                                                ...f,
                                                auth_type: e.target.value as "none" | "api_key" | "bearer",
                                            }))
                                        }
                                    >
                                        <option value="none">인증 없음</option>
                                        <option value="api_key">API 키 (쿼리)</option>
                                        <option value="bearer">Bearer 토큰</option>
                                    </select>
                                </div>
                            </div>

                            {/* 쿼리 파라미터 */}
                            <div className="csm-section">
                                <div className="csm-section-title">
                                    쿼리 파라미터
                                    <button className="csm-add-btn" onClick={() => addKvPair("query_params")}>
                                        <Plus size={12} /> 추가
                                    </button>
                                </div>
                                {sourceForm.query_params.map((pair, i) => (
                                    <div key={i} className="kv-pair-row">
                                        <input
                                            type="text"
                                            placeholder="키"
                                            value={pair.key}
                                            onChange={(e) => updateKvPair("query_params", i, "key", e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="값"
                                            value={pair.value}
                                            onChange={(e) => updateKvPair("query_params", i, "value", e.target.value)}
                                        />
                                        {sourceForm.query_params.length > 1 && (
                                            <button
                                                className="kv-remove-btn"
                                                onClick={() => removeKvPair("query_params", i)}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* 커스텀 헤더 */}
                            <div className="csm-section">
                                <div className="csm-section-title">
                                    커스텀 헤더
                                    <button className="csm-add-btn" onClick={() => addKvPair("headers")}>
                                        <Plus size={12} /> 추가
                                    </button>
                                </div>
                                {sourceForm.headers.map((pair, i) => (
                                    <div key={i} className="kv-pair-row">
                                        <input
                                            type="text"
                                            placeholder="키 (예: Authorization)"
                                            value={pair.key}
                                            onChange={(e) => updateKvPair("headers", i, "key", e.target.value)}
                                        />
                                        <input
                                            type="text"
                                            placeholder="값 (예: Bearer xxx)"
                                            value={pair.value}
                                            onChange={(e) => updateKvPair("headers", i, "value", e.target.value)}
                                        />
                                        {sourceForm.headers.length > 1 && (
                                            <button
                                                className="kv-remove-btn"
                                                onClick={() => removeKvPair("headers", i)}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 모달 푸터 */}
                        <div className="custom-source-modal-footer">
                            <button className="btn-modal-cancel" onClick={closeSourceModal}>
                                취소
                            </button>
                            <button
                                className="btn-modal-save"
                                onClick={saveCustomSource}
                                disabled={!sourceForm.name || !sourceForm.endpoint}
                            >
                                {editingSourceId ? "수정" : "추가"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

