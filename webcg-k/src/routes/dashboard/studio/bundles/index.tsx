/**
 * 번들 목록 페이지
 * CG 디자이너가 생성한 템플릿 번들(뉴스 CG 세트) 목록 관리
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Package, Plus, Trash2, Loader2, Layers, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchBundles,
  createBundle,
  deleteBundle,
} from "../../../../services/bundleService";
import type { TemplateBundle } from "../../../../services/bundleService";

export const Route = createFileRoute("/dashboard/studio/bundles/")({
  component: BundlesPage,
});

function BundlesPage() {
  const queryClient = useQueryClient();
  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ["bundles"],
    queryFn: fetchBundles,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formProgram, setFormProgram] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // 번들 생성
  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      await createBundle({
        name: formName.trim(),
        description: formDesc.trim() || undefined,
        program_name: formProgram.trim() || undefined,
      });
      setShowCreateModal(false);
      setFormName("");
      setFormDesc("");
      setFormProgram("");
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
    } catch (err) {
      console.error("번들 생성 실패:", err);
      alert("번들 생성에 실패했습니다.");
    }
  };

  // 번들 삭제
  const handleDelete = async (id: string) => {
    try {
      await deleteBundle(id);
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ["bundles"] });
    } catch (err) {
      console.error("번들 삭제 실패:", err);
    }
  };

  return (
    <div className="page-content">
      <div className="dash-page-header">
        <div>
          <div className="dash-page-title">
            <div className="dash-page-title-icon">
              <Package size={18} />
            </div>
            테마 번들
          </div>
          <div className="dash-page-subtitle">
            NRCS와 연동할 CG 세트를 관리합니다
          </div>
        </div>
        <div className="dash-page-actions">
          <button className="dash-btn accent" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} /> 새 번들
          </button>
        </div>
      </div>

      {/* 번들 카드 그리드 */}
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : bundles.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: 60, color: "var(--text-secondary)",
        }}>
          <Package size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <p>아직 생성된 번들이 없습니다.</p>
          <Button variant="secondary" style={{ marginTop: 12 }} onClick={() => setShowCreateModal(true)}>
            <Plus size={14} /> 첫 번째 번들 만들기
          </Button>
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16, marginTop: 16,
        }}>
          {bundles.map((b) => (
            <BundleCard
              key={b.id}
              bundle={b}
              deleteConfirmId={deleteConfirmId}
              setDeleteConfirmId={setDeleteConfirmId}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 생성 모달 */}
      {showCreateModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: "var(--app-bg-secondary)", borderRadius: 12, padding: 24,
              width: 420, border: "1px solid var(--border-primary)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📦 새 번들 만들기</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  번들 이름 *
                </label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="예: KBS 뉴스9 CG 세트" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  대상 프로그램 (NRCS 매칭용)
                </label>
                <Input value={formProgram} onChange={(e) => setFormProgram(e.target.value)} placeholder="예: KBS 뉴스 9" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, display: "block" }}>
                  설명 (선택)
                </label>
                <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="번들에 대한 설명" />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>취소</Button>
              <Button onClick={handleCreate} disabled={!formName.trim()}>생성</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 번들 카드 ──────────────────────────────────────────────────

function BundleCard({
  bundle, deleteConfirmId, setDeleteConfirmId, onDelete,
}: {
  bundle: TemplateBundle;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const slotCount = bundle.slot_count ?? 0;
  const updated = new Date(bundle.updated_at).toLocaleDateString("ko-KR");

  return (
    <div style={{
      background: "var(--app-bg-secondary)", border: "1px solid var(--border-primary)",
      borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} style={{ color: "var(--accent-primary)" }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{bundle.name}</span>
            {bundle.is_default && (
              <span style={{ fontSize: 10, background: "var(--accent-primary)", color: "#fff", padding: "1px 6px", borderRadius: 4 }}>
                기본
              </span>
            )}
          </div>
          {bundle.program_name && (
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
              📺 {bundle.program_name}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {deleteConfirmId === bundle.id ? (
            <>
              <Button variant="destructive" size="sm" onClick={() => onDelete(bundle.id)}>확인</Button>
              <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmId(null)}>취소</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon-xs" onClick={() => setDeleteConfirmId(bundle.id)}>
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </div>
      {bundle.description && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
          {bundle.description}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto" }}>
        <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--text-tertiary)" }}>
          <span><Layers size={11} /> {slotCount}개 슬롯</span>
          <span>· {updated}</span>
        </div>
        <Link to={`/dashboard/studio/bundles/${bundle.id}` as any}>
          <Button variant="secondary" size="sm">
            <Settings2 size={12} /> 편집
          </Button>
        </Link>
      </div>
    </div>
  );
}
