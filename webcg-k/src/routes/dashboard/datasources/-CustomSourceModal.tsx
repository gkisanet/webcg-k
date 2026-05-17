/**
 * 커스텀 데이터 소스 등록/편집 모달
 * datasources.tsx에서 분리 — 모달 UI + KV 페어 편집
 */

import { Globe, Plus, X } from "lucide-react";
import type { CustomSourceForm } from "./-datasourcesTypes";
import { ICON_OPTIONS, ACCENT_OPTIONS } from "./-datasourcesTypes";

// ─── Props ──────────────────────────────────────────────────────

interface CustomSourceModalProps {
    editingSourceId: string | null;
    sourceForm: CustomSourceForm;
    setSourceForm: React.Dispatch<React.SetStateAction<CustomSourceForm>>;
    onSave: () => void;
    onClose: () => void;
}

// ─── KV 페어 핸들러 (모달 내부용) ────────────────────────────────

function useKvPairHandlers(
    setSourceForm: React.Dispatch<React.SetStateAction<CustomSourceForm>>,
) {
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

    return { updateKvPair, addKvPair, removeKvPair };
}

// ─── 컴포넌트 ───────────────────────────────────────────────────

export function CustomSourceModal({
    editingSourceId,
    sourceForm,
    setSourceForm,
    onSave,
    onClose,
}: CustomSourceModalProps) {
    const { updateKvPair, addKvPair, removeKvPair } = useKvPairHandlers(setSourceForm);

    return (
        <div
            className="apikey-modal-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="custom-source-modal">
                <div className="custom-source-modal-header">
                    <h3>
                        <Globe size={16} />
                        {editingSourceId ? "소스 편집" : "커스텀 소스 추가"}
                    </h3>
                    <button className="overlay-wizard-close" onClick={onClose}>
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
                    <button className="btn-modal-cancel" onClick={onClose}>
                        취소
                    </button>
                    <button
                        className="btn-modal-save"
                        onClick={onSave}
                        disabled={!sourceForm.name || !sourceForm.endpoint}
                    >
                        {editingSourceId ? "수정" : "추가"}
                    </button>
                </div>
            </div>
        </div>
    );
}
