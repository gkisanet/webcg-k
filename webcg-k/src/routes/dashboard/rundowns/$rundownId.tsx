/**
 * Rundown Editor Page
 * SPX-GC 스타일 3-Pane Layout: 그래픽 라이브러리 | 런다운 | 미리보기+속성
 */

import {
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
    ChevronLeft,
    ChevronRight,
    FolderPlus,
    GripVertical,
    Layers,
    LayoutTemplate,
    Loader2,
    Palette,
    Play,
    Plus,
    Save,
    Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GraphicPreviewRenderer, getTextElements, type GraphicElement } from "../../../components/GraphicPreviewRenderer";
import { useAuth } from "../../../lib/auth";
import { supabase } from "../../../lib/supabase";
import { getWebcgkApiInline } from "../../../components/Overlay/PluginEditor/lib/webcgk-api";
import {
    buildOverlayReplicantData,
    getDashboardSchemaProperties,
    getSchemaDefaultValue,
    setOverlayReplicantValue,
} from "../../../lib/rundownOverlayData";
import {
  type RundownItem,
  type RundownMeta,
  type RundownSection,
  fetchRundownMeta,
  fetchRundownItems,
  addRundownItem,
  removeRundownItem,
  saveRundownItems,
  updateRundownTitle,
  updateRundownSections,
  createBroadcastSession,
} from "../../../services/rundownRepository";

export const Route = createFileRoute("/dashboard/rundowns/$rundownId")({
    component: RundownEditorPage,
});

// 탭 타입
type LibraryTab = "graphics" | "templates";

// 라이브러리 아이템 타입
interface LibraryItem {
    id: string;
    name: string;
    type: LibraryTab;
    thumbnail?: string;
    data?: any;
}

// ─── 로컬 UI 타입 ──────────────────────────────────────────────────
// RundownItem, RundownMeta, RundownSection → rundownRepository.ts 에서 import

// 섹션 컬러 팔레트 — 세그먼트별 시각적 구분
// ■ Why 12색? Premiere Pro의 Nested Sequence 색상 팔레트 참고
const SECTION_COLORS = [
    "rgba(59, 130, 246, 0.12)",   // 파랑
    "rgba(16, 185, 129, 0.12)",   // 초록
    "rgba(245, 158, 11, 0.12)",   // 주황
    "rgba(139, 92, 246, 0.12)",   // 보라
    "rgba(236, 72, 153, 0.12)",   // 핑크
    "rgba(6, 182, 212, 0.12)",    // 시안
    "rgba(234, 179, 8, 0.12)",    // 노랑
    "rgba(239, 68, 68, 0.12)",    // 빨강
    "rgba(34, 197, 94, 0.12)",    // 라임
    "rgba(168, 85, 247, 0.12)",   // 인디고
    "rgba(251, 146, 60, 0.12)",   // 암버
    "rgba(20, 184, 166, 0.12)",   // 틸
];

// 배열 순서 변경 유틸리티
function arrayMove<T>(array: T[], from: number, to: number): T[] {
    const newArray = array.slice();
    const [removed] = newArray.splice(from, 1);
    newArray.splice(to, 0, removed);
    return newArray;
}

// 런다운 아이템의 이미지 해상도 불완전 여부 체크
function checkResolutionWarning(item: RundownItem): boolean {
    const elements = item.data?.elements;
    if (!Array.isArray(elements)) return false;

    // 이미지 요소 찾기
    const imageElements = elements.filter((el: any) => el.type === "image");
    if (imageElements.length === 0) return false;

    // 이미지 요소 중 2K나 4K가 누락된 경우 경고
    return imageElements.some((img: any) => {
        const has2k = !!(img.src_2k || img.src);
        const has4k = !!img.src_4k;
        // 둘 중 하나만 있으면 경고
        return (has2k && !has4k) || (!has2k && has4k);
    });
}

// SortableRundownItem 컴포넌트
interface SortableRundownItemProps {
    item: RundownItem;
    index: number;
    isSelected: boolean;
    hasResolutionWarning?: boolean; // 2K/4K 해상도 불완전 경고
    onSelect: () => void;
    onPlay: () => void;
    onDelete: () => void;
}

function SortableRundownItem({ item, index, isSelected, hasResolutionWarning, onSelect, onPlay, onDelete }: SortableRundownItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`rundown-item ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""}`}
            onClick={onSelect}
        >
            <div className="rundown-item-drag" {...attributes} {...listeners}>
                <GripVertical size={16} />
            </div>
            <span className="rundown-item-order">{index + 1}</span>
            {item.thumbnail ? (
                <img src={item.thumbnail} alt="" className="rundown-item-thumb" />
            ) : (
                <div className="rundown-item-thumb-placeholder">
                    {item.source_type === "graphic" && <Palette size={16} />}
                    {item.source_type === "template" && <LayoutTemplate size={16} />}
                    {item.source_type === "overlay" && <Layers size={16} />}
                </div>
            )}
            <div className="rundown-item-info">
                <span className="rundown-item-type">{item.source_type}</span>
                <span className="rundown-item-name">{item.source_name}</span>
            </div>
            {/* 해상도 불완전 경고 아이콘 */}
            {hasResolutionWarning && (
                <span
                    title="2K 또는 4K 이미지가 누락되어 렌더링 품질 저하 가능"
                    style={{
                        color: "#eab308",
                        marginRight: "4px",
                        fontSize: "14px",
                    }}
                >
                    ⚠️
                </span>
            )}
            <div className="rundown-item-duration">{item.duration}s</div>
            <button
                type="button"
                className="rundown-item-play"
                onClick={(e) => {
                    e.stopPropagation();
                    onPlay();
                }}
            >
                <Play size={14} />
            </button>
            <button
                type="button"
                className="rundown-item-delete"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
            >
                <Trash2 size={14} />
            </button>
        </div>
    );
}

// ─── DroppableSection ─────────────────────────────────────────
// ■ Why?
//   useDroppable로 섹션 영역을 드롭존(droppable)으로 등록.
//   아이템을 끌어다 놓으면 handleDragEnd에서 over.data.current.sectionId를
//   감지하여 해당 섹션에 자동 배정. Sortable 아이템과 공존 가능.
function DroppableSection({
    section,
    isCollapsed,
    children,
}: {
    section: RundownSection;
    isCollapsed: boolean;
    children: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({
        id: `section-drop-${section.id}`,
        data: { sectionId: section.id },
    });

    return (
        <div
            ref={setNodeRef}
            className={`rundown-section ${isCollapsed ? "" : "expanded"}`}
            style={{
                // 아이템을 드래그하여 위에 올리면 시각적 피드백
                outline: isOver ? "2px dashed var(--accent-primary)" : undefined,
                outlineOffset: isOver ? "-2px" : undefined,
                transition: "outline 0.15s ease",
            }}
        >
            {children}
        </div>
    );
}

function RundownEditorPage() {
    const { rundownId } = Route.useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // 상태
    const [loading, setLoading] = useState(true);
    const [rundown, setRundown] = useState<RundownMeta | null>(null);
    const [items, setItems] = useState<RundownItem[]>([]);
    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    // 라이브러리 상태
    const [activeTab, setActiveTab] = useState<LibraryTab>("graphics");
    const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);

    // 미리보기 패널 리사이즈 상태
    const [previewWidth, setPreviewWidth] = useState(320);
    const [isResizing, setIsResizing] = useState(false);

    // 클립보드 (복사된 아이템)
    const [copiedItem, setCopiedItem] = useState<RundownItem | null>(null);

    // ─── 섹션 상태 ───
    const [sections, setSections] = useState<RundownSection[]>([]);
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    // ─── 활성 섹션 (Google My Maps 레이어 선택 패턴) ───
    // ■ Why?
    //   비유: Google My Maps에서 레이어를 선택하면 검색된 장소가 선택된 레이어에 추가됨.
    //   섹션 헤더를 클릭하면 활성 섹션이 되고, 이후 갤러리에서 추가하는 그래픽은
    //   해당 섹션으로 자동 삽입. 아이템을 먼저 선택할 필요 없이 섹션만 선택하면 됨.
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

    // ─── 애니메이션 프리뷰 모달 ───
    const [showPreview, setShowPreview] = useState(false);
    const [previewItem, setPreviewItem] = useState<RundownItem | null>(null);
    const [previewCode, setPreviewCode] = useState<{ html: string; css: string; js: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const previewIframeRef = useRef<HTMLIFrameElement>(null);

    // 섹션 추가
    const handleAddSection = () => {
        const newSection: RundownSection = {
            id: `sec-${Date.now()}`,
            label: `SECTION ${sections.length + 1}`,
            order: sections.length,
            color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
        };
        setSections(prev => [...prev, newSection]);
    };

    // 섹션 삭제 — 소속 아이템의 section_id를 null로 초기화
    const handleDeleteSection = (sectionId: string) => {
        setSections(prev => prev.filter(s => s.id !== sectionId));
        setItems(prev => prev.map(item =>
            item.section_id === sectionId ? { ...item, section_id: null } : item
        ));
    };

    // 섹션 이름 변경
    const handleRenameSection = (sectionId: string, newLabel: string) => {
        setSections(prev => prev.map(s =>
            s.id === sectionId ? { ...s, label: newLabel } : s
        ));
    };

    // 섹션 접기/펼치기 토글
    const toggleSectionCollapse = (sectionId: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    };

    // ─── Wrap CG (트랙 레이어 트리 구조) ───
    // ■ Why?
    //   런다운에서 아이템의 트랙 역할을 미리 지정하면,
    //   세션 생성 시 Track 1(배경판)과 Track 2(자막)에 자동 배치.
    //   비유: 뉴스 한 꼭지에서 "속보 배경판"은 꼭지 전체 동안 유지(Track 1),
    //   "인물명 자막"은 개별적으로 나타났다 사라짐(Track 2).

    // 아이템을 Wrap CG로 전환 (toggle)
    // ■ Why 자동 자식 할당 제거?
    //   기존: Wrap 전환 시 바로 뒤의 Main 아이템들을 자동으로 자식 할당
    //   문제: 의도치 않은 CG가 Wrap 밑으로 들어가서 수동 해제 필요 → 작업 속도 저하
    //   개선: track_layer만 변경하고, 자식 할당은 사용자가 직접 제어
    //   (속성 패널 드롭다운 or 갤러리에서 Wrap 선택 후 추가)
    const handleToggleWrap = (itemId: string) => {
        setItems(prev => {
            const item = prev.find(i => i.id === itemId);
            if (!item) return prev;

            const isCurrentlyWrap = item.track_layer === "wrap";
            if (isCurrentlyWrap) {
                // Wrap 해제: 자식들의 parent_item_id도 초기화
                return prev.map(i => {
                    if (i.id === itemId) return { ...i, track_layer: null, parent_item_id: null };
                    if (i.parent_item_id === itemId) return { ...i, parent_item_id: null };
                    return i;
                });
            } else {
                // Wrap 지정: track_layer만 "wrap"으로 변경
                // 자식 아이템은 사용자가 직접 지정 (속성 패널 또는 갤러리 삽입)
                return prev.map(i => {
                    if (i.id === itemId) return { ...i, track_layer: "wrap" as const };
                    return i;
                });
            }
        });
    };

    // 자식 아이템의 부모(Wrap CG) 설정/해제
    const handleSetParent = (childId: string, parentId: string | null) => {
        setItems(prev => prev.map(i =>
            i.id === childId ? { ...i, parent_item_id: parentId } : i
        ));
    };

    // Wrap CG 삭제 시 자식을 orphan 복구
    // ■ Why override? 기존 handleDeleteItem은 section_id만 처리.
    //   Wrap 아이템 삭제 시 자식의 parent_item_id도 null로 초기화해야
    //   유령 참조 방지.
    const handleDeleteItemWithOrphanRecovery = async (id: string) => {
        if (!confirm("이 항목을 삭제하시겠습니까?")) return;

        try {
            await removeRundownItem(id);
        } catch (error) {
            console.error("Error deleting item:", error);
            return;
        }

        setItems(prev => {
            const deletedItem = prev.find(i => i.id === id);
            return prev
                .filter(i => i.id !== id)
                .map(i => {
                    // 삭제된 아이템이 Wrap CG였다면 자식의 parent_item_id 초기화
                    if (deletedItem?.track_layer === "wrap" && i.parent_item_id === id) {
                        return { ...i, parent_item_id: null };
                    }
                    return i;
                });
        });
        if (selectedItemId === id) setSelectedItemId(null);
    };

    // ■ Why user?.id?
    //   user 객체는 Supabase TOKEN_REFRESHED 이벤트 때마다 새 참조가 생성된다.
    //   user 자체를 의존성에 넣으면 탭 복귀 시 토큰 갱신 → loadRundownData() 재호출
    //   → DB에 저장하지 않은 로컬 섹션/아이템 상태가 전부 날아간다.
    //   user?.id는 문자열이므로 참조 비교가 아닌 값 비교로 안정적.
    const hasLoadedRef = useRef(false);

    // 데이터 로딩 (최초 1회만, 또는 rundownId가 변경될 때만)
    useEffect(() => {
        if (!user) return;
        // rundownId가 변경되면 다시 로드해야 하므로 ref 리셋
        hasLoadedRef.current = false;
    }, [rundownId]);

    useEffect(() => {
        if (!user || hasLoadedRef.current) return;
        hasLoadedRef.current = true;
        loadRundownData();
    }, [rundownId, user?.id]);

    // 탭 변경 시 라이브러리 로드
    useEffect(() => {
        if (!user) return;
        loadLibraryData();
    }, [activeTab, user?.id]);

    // 미리보기 패널 리사이즈 핸들러
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            // 윈도우 오른쪽에서 마우스 위치까지의 거리 = 새 패널 너비
            const newWidth = window.innerWidth - e.clientX;
            // 최소 200px, 최대 600px
            setPreviewWidth(Math.max(200, Math.min(600, newWidth)));
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isResizing]);

    // 키보드 단축키 핸들러
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // 입력 필드에서는 무시
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            const currentIndex = items.findIndex(i => i.id === selectedItemId);

            switch (e.key) {
                case "ArrowUp":
                    e.preventDefault();
                    // 이전 아이템 선택
                    if (currentIndex > 0) {
                        setSelectedItemId(items[currentIndex - 1].id);
                    } else if (items.length > 0 && !selectedItemId) {
                        setSelectedItemId(items[0].id);
                    }
                    break;

                case "ArrowDown":
                    e.preventDefault();
                    // 다음 아이템 선택
                    if (currentIndex < items.length - 1 && currentIndex >= 0) {
                        setSelectedItemId(items[currentIndex + 1].id);
                    } else if (items.length > 0 && !selectedItemId) {
                        setSelectedItemId(items[0].id);
                    }
                    break;

                case " ": // Space
                    e.preventDefault();
                    // 다음 아이템으로 이동 (순환)
                    if (items.length > 0) {
                        if (currentIndex < items.length - 1) {
                            setSelectedItemId(items[currentIndex + 1].id);
                        } else {
                            // 마지막이면 처음으로
                            setSelectedItemId(items[0].id);
                        }
                    }
                    break;

                case "Delete":
                case "Backspace":
                    // 선택된 아이템 삭제
                    if (selectedItemId && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        handleDeleteItem(selectedItemId);
                    }
                    break;

                case "c":
                    // Ctrl+C: 복사
                    if ((e.ctrlKey || e.metaKey) && selectedItem) {
                        e.preventDefault();
                        setCopiedItem({ ...selectedItem });
                    }
                    break;

                case "v":
                    // Ctrl+V: 붙여넣기
                    if ((e.ctrlKey || e.metaKey) && copiedItem) {
                        e.preventDefault();
                        handlePasteItem();
                    }
                    break;
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [items, selectedItemId, copiedItem]);

    const loadRundownData = async () => {
        setLoading(true);
        try {
            const meta = await fetchRundownMeta(rundownId);
            setRundown(meta);

            if (meta.sections_data && Array.isArray(meta.sections_data)) {
                setSections(meta.sections_data);
            }

            const enrichedItems = await fetchRundownItems(rundownId);
            setItems(enrichedItems);
        } catch (error) {
            console.error("Error loading rundown:", error);
            alert("런다운 데이터를 불러오는 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    const loadLibraryData = async () => {
        setLibraryLoading(true);
        try {
            let data: LibraryItem[] = [];

            if (activeTab === "graphics") {
                // Graphics 테이블에서 가져오기 (template_data에 elements 포함)
                const { data: graphics, error } = await supabase
                    .from("graphics")
                    .select("id, name, thumbnail_path, template_data")
                    .or(`owner_id.eq.${user!.id},is_public.eq.true`)
                    .order("updated_at", { ascending: false })
                    .limit(50);

                if (!error && graphics) {
                    data = (graphics as any[]).map(g => {
                        // ■ Why getPublicUrl?
                        //   thumbnail_path는 Storage 상대 경로(예: "thumbnails/abc.png")
                        //   → 브라우저에서 렌더링하려면 전체 URL이 필요
                        let thumbnailUrl: string | undefined = undefined;
                        if (g.thumbnail_path) {
                            const { data: urlData } = supabase.storage
                                .from("graphics")
                                .getPublicUrl(g.thumbnail_path);
                            thumbnailUrl = urlData?.publicUrl;
                        }
                        return {
                            id: g.id,
                            name: g.name,
                            type: "graphics" as LibraryTab,
                            thumbnail: thumbnailUrl,
                            data: {
                                elements: g.template_data?.elements || [],
                                canvas_size: g.template_data?.canvas_size || { width: 1920, height: 1080 },
                            },
                        };
                    });
                }
            } else if (activeTab === "templates") {
                // Grid Templates 테이블에서 가져오기
                const { data: templates, error } = await supabase
                    .from("grid_templates")
                    .select("id, name, thumbnail_path, splits, zones")
                    .or(`owner_id.eq.${user!.id},is_public.eq.true`)
                    .order("updated_at", { ascending: false })
                    .limit(50);

                if (!error && templates) {
                    data = (templates as any[]).map(t => ({
                        id: t.id,
                        name: t.name,
                        type: "templates" as LibraryTab,
                        thumbnail: t.thumbnail_path,
                        data: { splits: t.splits, zones: t.zones },
                    }));
                }
            }

            setLibraryItems(data);
        } catch (error) {
            console.error("Error loading library:", error);
        } finally {
            setLibraryLoading(false);
        }
    };

    // 라이브러리 아이템을 런다운에 추가
    // ■ Why 컨텍스트 기반 삽입?
    //   비유: Premiere Pro에서 "시퀀스 안의 빈"에 소스를 드래그하면
    //   현재 재생 헤드 위치에 삽입되듯이, 선택된 컨텍스트에 따라 삽입.
    //   작업 속도 향상: 섹션/Wrap 선택 후 클릭만으로 정확한 위치에 배치.
    const handleAddToRundown = async (item: LibraryItem) => {
        // ─── 컨텍스트 기반 삽입 (3단계 우선순위) ───
        // ■ 우선순위:
        //   1) 선택된 아이템이 Wrap CG → Wrap의 자식으로 삽입
        //   2) 선택된 아이템이 섹션에 속함 → 같은 섹션, 아이템 뒤에 삽입
        //   3) 활성 섹션(Google My Maps 레이어) → 해당 섹션 맨 끝에 삽입
        //   4) 아무것도 없으면 → 미분류 맨 뒤에 삽입
        const selectedItem = items.find(i => i.id === selectedItemId);
        let inheritSectionId: string | null = null;
        let inheritParentId: string | null = null;
        let insertAfterIndex = items.length - 1; // 기본: 맨 뒤

        if (selectedItem) {
            // 1순위: 선택된 아이템이 Wrap CG → 자식으로 삽입
            if (selectedItem.track_layer === "wrap") {
                inheritSectionId = selectedItem.section_id || null;
                inheritParentId = selectedItem.id; // Wrap CG의 자식이 됨
                // Wrap CG의 마지막 자식 뒤에 삽입
                const wrapChildren = items.filter(i => i.parent_item_id === selectedItem.id);
                if (wrapChildren.length > 0) {
                    const lastChildIndex = Math.max(
                        ...wrapChildren.map(c => items.findIndex(i => i.id === c.id))
                    );
                    insertAfterIndex = lastChildIndex;
                } else {
                    insertAfterIndex = items.findIndex(i => i.id === selectedItem.id);
                }
            }
            // 2순위: 선택된 아이템이 섹션에 속함 → 같은 섹션에 삽입
            else if (selectedItem.section_id) {
                inheritSectionId = selectedItem.section_id;
                // 선택된 아이템 바로 뒤에 삽입
                insertAfterIndex = items.findIndex(i => i.id === selectedItem.id);
            }
        }
        // 3순위: 활성 섹션이 있으면 해당 섹션 맨 끝에 삽입
        // ■ Why? Google My Maps 패턴: 레이어(섹션) 선택 → 아이템 추가 = 해당 레이어에 삽입
        else if (activeSectionId) {
            inheritSectionId = activeSectionId;
            // 해당 섹션의 마지막 아이템 뒤에 삽입
            const sectionItems = items.filter(i => i.section_id === activeSectionId);
            if (sectionItems.length > 0) {
                const lastSectionItemIndex = Math.max(
                    ...sectionItems.map(si => items.findIndex(i => i.id === si.id))
                );
                insertAfterIndex = lastSectionItemIndex;
            }
        }

        const newItem: Partial<RundownItem> = {
            source_type: item.type === "graphics" ? "graphic" : "template",
            source_id: item.id,
            source_name: item.name,
            data: item.data || {},
            item_order: items.length,
            duration: 10,
            thumbnail: item.thumbnail,
            section_id: inheritSectionId,
            parent_item_id: inheritParentId,
        };

        try {
            const newRundownItem = await addRundownItem(rundownId, newItem);
            setItems(prev => {
                const next = [...prev];
                next.splice(insertAfterIndex + 1, 0, newRundownItem);
                return next;
            });
            setSelectedItemId(newRundownItem.id);
        } catch (error) {
            console.error("Error adding item:", error);
        }
    };

    // 아이템 붙여넣기 (복사된 아이템을 새로 생성)
    const handlePasteItem = async () => {
        if (!copiedItem) return;

        const newItem: Partial<RundownItem> = {
            source_type: copiedItem.source_type,
            source_id: copiedItem.source_id,
            source_name: `${copiedItem.source_name} (복사본)`,
            data: copiedItem.data ? { ...copiedItem.data } : {},
            item_order: items.length,
            duration: copiedItem.duration,
            thumbnail: copiedItem.thumbnail,
        };

        try {
            const pasted = await addRundownItem(rundownId, newItem);
            setItems([...items, pasted]);
            setSelectedItemId(pasted.id);
        } catch (error) {
            console.error("Error pasting item:", error);
        }
    };

    // 아이템 삭제
    const handleDeleteItem = async (id: string) => {
        if (!confirm("이 항목을 삭제하시겠습니까?")) return;

        try {
            await removeRundownItem(id);
            setItems(prev => prev.filter(i => i.id !== id));
            if (selectedItemId === id) setSelectedItemId(null);
        } catch (error) {
            console.error("Error deleting item:", error);
        }
    };

    // 저장 (아이템 순서 + 섹션 데이터)
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await saveRundownItems(rundownId, items);
            await updateRundownSections(rundownId, sections);
            alert("저장되었습니다.");
        } catch (error) {
            console.error("Error saving:", error);
            alert("저장 중 오류가 발생했습니다.");
        } finally {
            setIsSaving(false);
        }
    };

    // 프로젝트(세션) 생성
    // ■ 섹션이 있으면 broadcast_segments 자동 생성 → 컨트롤러에서 Segment Tab 활성화
    const handleCreateSession = async () => {
        if (items.length === 0) {
            alert("런다운에 아이템이 없습니다. 먼저 아이템을 추가해주세요.");
            return;
        }

        setIsCreatingSession(true);
        try {
            await createBroadcastSession(
                rundownId,
                rundown?.title || "Untitled",
                rundown?.description || null,
                user!.id,
                items,
                sections,
            );
            navigate({ to: "/dashboard/broadcast" });
        } catch (error) {
            console.error("Error creating session:", error);
            alert("프로젝트 생성 중 오류가 발생했습니다.");
        } finally {
            setIsCreatingSession(false);
        }
    };

    // ─── 애니메이션 프리뷰 (아이템별 Play) ───
    const handlePlayItem = async (item: RundownItem) => {
        if (item.source_type !== "overlay" && item.source_type !== "template") {
            alert("현재 오버레이/템플릿 아이템만 애니메이션 미리보기를 지원합니다.");
            return;
        }
        setPreviewItem(item);
        setPreviewCode(null);
        setPreviewLoading(true);
        setShowPreview(true);
        try {
            const { data: template } = await supabase
                .from("overlay_templates")
                .select("source_code")
                .eq("id", item.source_id)
                .single();
            if (template) {
                const sourceCode = (template as any).source_code || {};
                setPreviewCode({
                    html: sourceCode.html || "",
                    css: sourceCode.css || "",
                    js: sourceCode.js || "",
                });
            }
        } catch (err) {
            console.error("Failed to load overlay:", err);
        } finally {
            setPreviewLoading(false);
        }
    };

    // srcdoc 생성 — 코드 + webcgk-api.js 주입
    const buildPreviewSrcdoc = (html: string, css: string, js: string) => {
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html {
  background-color: #666;
  background-image:
    linear-gradient(45deg, #444 25%, transparent 25%),
    linear-gradient(-45deg, #444 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #444 75%),
    linear-gradient(-45deg, transparent 75%, #444 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
}
body { width: 100%; height: 100vh; overflow: hidden; background: transparent; }
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}
${css}
</style>
</head>
<body>
${html}
<script>${getWebcgkApiInline()}</script>
<script>${js}</script>
</body>
</html>`;
    };

    // 프리뷰 iframe에 데이터 전달 후 SHOW
    const triggerPreviewShow = () => {
        if (previewIframeRef.current?.contentWindow && previewItem) {
            const replicantData = buildOverlayReplicantData(previewItem.data);
            previewIframeRef.current.contentWindow.postMessage(
                { type: "INIT", payload: replicantData },
                "*",
            );
            setTimeout(() => {
                previewIframeRef.current?.contentWindow?.postMessage(
                    { type: "SHOW" },
                    "*",
                );
            }, 150);
        }
    };

    // 드래그앤드롭 센서
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // 드래그 종료 시 순서 변경 + 섹션 배정
    // ■ Why handleDragEnd 확장?
    //   기존: sortable 순서 변경만 처리 (아이템↔아이템).
    //   추가: droppable 섹션 영역에 드롭 시 section_id를 자동 할당하여
    //   사용자가 속성 패널 드롭다운 없이도 직관적으로 섹션에 아이템을 넣을 수 있음.
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;

        // 1. 섹션 드롭존에 놓았는지 확인
        const overData = over.data?.current as { sectionId?: string } | undefined;
        if (overData?.sectionId) {
            // 아이템을 해당 섹션에 배정
            setItems((prev) =>
                prev.map((item) =>
                    item.id === active.id
                        ? { ...item, section_id: overData.sectionId }
                        : item
                )
            );
            return;
        }

        // 2. 아이템↔아이템 순서 변경 (기존 sortable 로직)
        if (active.id !== over.id) {
            setItems((prev) => {
                const oldIndex = prev.findIndex((i) => i.id === active.id);
                const newIndex = prev.findIndex((i) => i.id === over.id);
                if (oldIndex === -1 || newIndex === -1) return prev;

                // 이동된 아이템이 다른 섹션의 아이템 위에 놓이면 해당 섹션으로 이동
                const targetItem = prev[newIndex];
                const movedItems = arrayMove(prev, oldIndex, newIndex);
                if (targetItem.section_id) {
                    return movedItems.map((item) =>
                        item.id === active.id
                            ? { ...item, section_id: targetItem.section_id }
                            : item
                    );
                }
                return movedItems;
            });
        }
    };

    // 선택된 아이템
    const selectedItem = items.find(i => i.id === selectedItemId);
    const selectedOverlaySchemaProperties = selectedItem?.source_type === "overlay"
        ? getDashboardSchemaProperties(selectedItem.data)
        : {};
    const selectedOverlaySchemaEntries = Object.entries(selectedOverlaySchemaProperties);
    const selectedOverlayData = selectedItem?.source_type === "overlay"
        ? buildOverlayReplicantData(selectedItem.data)
        : {};

    if (loading) {
        return (
            <div className="rundown-editor-loading">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    return (
        <div className="rundown-editor">
            {/* 헤더 */}
            <header className="rundown-editor-header">
                <div className="header-left">
                    <Link to="/dashboard/rundowns" className="back-btn">
                        <ChevronLeft size={20} />
                    </Link>
                    <div className="header-info">
                        {/* 인라인 제목 편집 */}
                        <input
                            type="text"
                            className="header-title-input"
                            value={rundown?.title || ""}
                            onChange={(e) => {
                                if (rundown) setRundown({ ...rundown, title: e.target.value });
                            }}
                            onBlur={async () => {
                                if (!rundown?.title?.trim()) return;
                                try {
                                    await updateRundownTitle(rundownId, rundown.title);
                                } catch (error) {
                                    console.error("제목 저장 실패:", error);
                                }
                            }}
                            onKeyDown={async (e) => {
                                if (e.key === "Enter") {
                                    (e.target as HTMLInputElement).blur();
                                } else if (e.key === "Escape") {
                                    // ESC: 원래 값으로 복원 (다시 로드)
                                    (e.target as HTMLInputElement).blur();
                                }
                            }}
                            placeholder="큐시트 이름 입력"
                        />
                        <span className="header-subtitle">
                            {items.length}개 아이템 • {rundown?.description || "설명 없음"}
                        </span>
                    </div>
                </div>
                <div className="header-right">
                    <Button
                        variant="secondary"
                        onClick={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                        저장
                    </Button>
                    <div className="header-divider" />
                    <Button
                        onClick={handleCreateSession}
                        disabled={isCreatingSession || items.length === 0}
                    >
                        {isCreatingSession ? <Loader2 className="animate-spin" size={18} /> : <FolderPlus size={18} />}
                        프로젝트 생성
                    </Button>
                </div>
            </header>

            {/* 3컬럼 레이아웃 */}
            <div className="rundown-editor-body">
                {/* 왼쪽: 그래픽 라이브러리 */}
                <aside className="library-panel">
                    <div className="library-tabs">
                        <button
                            type="button"
                            className={`library-tab ${activeTab === "graphics" ? "active" : ""}`}
                            onClick={() => setActiveTab("graphics")}
                        >
                            <Palette size={16} />
                            그래픽
                        </button>
                        <button
                            type="button"
                            className={`library-tab ${activeTab === "templates" ? "active" : ""}`}
                            onClick={() => setActiveTab("templates")}
                        >
                            <LayoutTemplate size={16} />
                            템플릿
                        </button>
                    </div>
                    <div className="library-content">
                        {libraryLoading ? (
                            <div className="library-loading">
                                <Loader2 className="animate-spin" size={24} />
                            </div>
                        ) : libraryItems.length === 0 ? (
                            <div className="library-empty">
                                항목이 없습니다
                            </div>
                        ) : (
                            <div className="library-grid">
                                {libraryItems.map(item => (
                                    <div
                                        key={item.id}
                                        className="library-item"
                                        onClick={() => handleAddToRundown(item)}
                                        title={item.name}
                                    >
                                        {item.thumbnail ? (
                                            <img src={item.thumbnail} alt={item.name} className="library-item-thumb" />
                                        ) : item.data?.elements && item.data.elements.length > 0 ? (
                                            /* ■ Why GraphicPreviewRenderer fallback?
                                               대부분의 그래픽은 thumbnail_path가 null (에디터에서 저장 시 썸네일 미생성).
                                               대신 template_data.elements가 있으므로, SVG 기반 실시간 미니 프리뷰로
                                               사용자에게 시각적 피드백 제공. */
                                            <div className="library-item-preview">
                                                <GraphicPreviewRenderer
                                                    elements={item.data.elements as GraphicElement[]}
                                                />
                                            </div>
                                        ) : (
                                            <div className="library-item-placeholder">
                                                {activeTab === "graphics" && <Palette size={24} />}
                                                {activeTab === "templates" && <LayoutTemplate size={24} />}
                                            </div>
                                        )}
                                        <span className="library-item-name">{item.name}</span>
                                        <Plus size={16} className="library-item-add" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                {/* 중앙: 런다운 목록 (섹션 기반 그룹화) */}
                <main className="rundown-panel">
                    <div className="rundown-header">
                        <h2>런다운 순서</h2>
                        <span className="rundown-count">{items.length}개{sections.length > 0 ? ` • ${sections.length} 섹션` : ""}</span>
                    </div>
                    <div className="rundown-list">
                        {/* + Add Section 버튼 */}
                        <button
                            type="button"
                            className="add-section-btn"
                            onClick={handleAddSection}
                        >
                            <Plus size={16} />
                            Add Section
                        </button>

                        {items.length === 0 && sections.length === 0 ? (
                            <div className="rundown-empty">
                                <Plus size={32} />
                                <p>왼쪽 라이브러리에서<br />아이템을 추가하세요</p>
                            </div>
                        ) : (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={items.map(i => i.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {/* 섹션별 그룹 렌더링 */}
                                    {sections.map((section) => {
                                        const sectionItems = items.filter(i => i.section_id === section.id);
                                        const isCollapsed = collapsedSections.has(section.id);

                                        return (
                                            <DroppableSection
                                                key={section.id}
                                                section={section}
                                                isCollapsed={isCollapsed}
                                            >
                                                {/* 섹션 헤더 — 클릭으로 활성 섹션 설정 + 접기/펼치기 */}
                                                {/* ■ Why 활성 섹션?
                                                     Google My Maps 레이어 선택 패턴: 섹션을 클릭하면 "활성"이 되어
                                                     이후 갤러리에서 추가하는 아이템이 자동으로 이 섹션에 삽입됨. */}
                                                <div
                                                    className={`section-header ${activeSectionId === section.id ? "section-header--active" : ""}`}
                                                    onClick={() => {
                                                        // 활성 섹션 토글 (같은 섹션 다시 클릭하면 비활성화)
                                                        setActiveSectionId(prev => prev === section.id ? null : section.id);
                                                        // 섹션 선택 시 아이템 선택 해제 (섹션이 우선)
                                                        setSelectedItemId(null);
                                                        // 접혀있으면 펼침
                                                        if (collapsedSections.has(section.id)) {
                                                            toggleSectionCollapse(section.id);
                                                        }
                                                    }}
                                                >
                                                    <span className="section-collapse-icon">
                                                        <ChevronRight size={14} />
                                                    </span>
                                                    <div
                                                        className="section-color-bar"
                                                        style={{ background: section.color.replace("0.12", "0.7") }}
                                                    />
                                                    <input
                                                        type="text"
                                                        className="section-label-input"
                                                        value={section.label}
                                                        onChange={(e) => handleRenameSection(section.id, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                                        }}
                                                    />
                                                    <span className="section-count-badge">
                                                        {sectionItems.length}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="section-delete-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteSection(section.id);
                                                        }}
                                                        title="섹션 삭제"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>

                                                {/* 섹션 내부 아이템 — 트리 구조 렌더링 */}
                                                {/* ■ Why 트리 구조?
                                                     Wrap CG(부모)는 배경판 역할로 Track 1에 배치되고,
                                                     자식(Main CG)은 자막 역할로 Track 2에 배치됨.
                                                     VS Code 파일 트리처럼 들여쓰기 + 연결선으로 시각화. */}
                                                <div className={`section-items ${isCollapsed ? "collapsed" : ""}`}>
                                                    {sectionItems.length === 0 ? (
                                                        <div className="section-empty">
                                                            아이템을 여기에 드래그하여 추가하세요
                                                        </div>
                                                    ) : (
                                                        (() => {
                                                            // 트리 구조 렌더링: Wrap CG → 자식 그룹핑
                                                            const rendered: React.ReactNode[] = [];
                                                            let i = 0;

                                                            while (i < sectionItems.length) {
                                                                const item = sectionItems[i];
                                                                const globalIndex = items.findIndex(it => it.id === item.id);

                                                                if (item.track_layer === "wrap") {
                                                                    // ── Wrap CG (부모 아이템) ──
                                                                    const wrapId = item.id;
                                                                    const children = sectionItems.filter(c => c.parent_item_id === wrapId);

                                                                    rendered.push(
                                                                        <div key={wrapId} className="rundown-tree-group">
                                                                            {/* Wrap CG 아이템 */}
                                                                            <div
                                                                                className={`rundown-item rundown-item--wrap ${selectedItemId === item.id ? "selected" : ""}`}
                                                                                onClick={() => setSelectedItemId(item.id)}
                                                                            >
                                                                                <div className="rundown-item-drag">
                                                                                    <GripVertical size={16} />
                                                                                </div>
                                                                                <span className="rundown-item-order">{globalIndex + 1}</span>
                                                                                <Layers size={16} className="wrap-icon" />
                                                                                <div className="rundown-item-info">
                                                                                    <span className="rundown-item-type">
                                                                                        {item.source_type}
                                                                                        <span className="wrap-badge">Wrap</span>
                                                                                    </span>
                                                                                    <span className="rundown-item-name">{item.source_name}</span>
                                                                                </div>
                                                                                <span className="section-count-badge">{children.length}</span>
                                                                                <div className="rundown-item-duration">{item.duration}s</div>
                                                                                <button
                                                                                    type="button"
                                                                                    className="rundown-item-play"
                                                                                    onClick={(e) => { e.stopPropagation(); }}
                                                                                    title="Wrap 해제"
                                                                                >
                                                                                    <Layers size={14} />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="rundown-item-delete"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        handleDeleteItemWithOrphanRecovery(item.id);
                                                                                    }}
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </button>
                                                                            </div>

                                                                            {/* 자식 아이템들 — 트리 들여쓰기 */}
                                                                            {children.length > 0 && (
                                                                                <div className="rundown-tree-children">
                                                                                    {children.map((child) => {
                                                                                        const childGlobalIndex = items.findIndex(it => it.id === child.id);
                                                                                        return (
                                                                                            <SortableRundownItem
                                                                                                key={child.id}
                                                                                                item={child}
                                                                                                index={childGlobalIndex}
                                                                                                isSelected={selectedItemId === child.id}
                                                                                                hasResolutionWarning={checkResolutionWarning(child)}
                                                                                                onSelect={() => setSelectedItemId(child.id)}
                                                                                                onPlay={() => handlePlayItem(child)}
                                                                                                onDelete={() => handleDeleteItemWithOrphanRecovery(child.id)}
                                                                                            />
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                    i++;
                                                                } else if (!item.parent_item_id) {
                                                                    // ── 독립 Main 아이템 (Wrap에 속하지 않음) ──
                                                                    rendered.push(
                                                                        <SortableRundownItem
                                                                            key={item.id}
                                                                            item={item}
                                                                            index={globalIndex}
                                                                            isSelected={selectedItemId === item.id}
                                                                            hasResolutionWarning={checkResolutionWarning(item)}
                                                                            onSelect={() => setSelectedItemId(item.id)}
                                                                            onPlay={() => handlePlayItem(item)}
                                                                            onDelete={() => handleDeleteItemWithOrphanRecovery(item.id)}
                                                                        />
                                                                    );
                                                                    i++;
                                                                } else {
                                                                    // 자식이지만 Wrap 아래에서 이미 렌더링된 경우 건너뜀
                                                                    i++;
                                                                }
                                                            }

                                                            return rendered;
                                                        })()
                                                    )}

                                                    {/* "+ Wrap CG" 버튼 */}
                                                    <button
                                                        type="button"
                                                        className="add-wrap-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            // 섹션 내 선택된 아이템을 Wrap으로 전환
                                                            if (selectedItemId) {
                                                                const sel = items.find(i => i.id === selectedItemId);
                                                                if (sel?.section_id === section.id) {
                                                                    handleToggleWrap(selectedItemId);
                                                                    return;
                                                                }
                                                            }
                                                            // 선택된 아이템이 없거나 다른 섹션이면 안내
                                                            alert("이 섹션의 아이템을 먼저 선택한 후 Wrap CG로 전환하세요.");
                                                        }}
                                                    >
                                                        <Layers size={14} />
                                                        선택 아이템을 Wrap CG로 전환
                                                    </button>
                                                </div>
                                            </DroppableSection>
                                        );
                                    })}

                                    {/* 미분류 아이템 (섹션에 속하지 않은 아이템) */}
                                    {(() => {
                                        const unsortedItems = items.filter(
                                            i => !i.section_id || !sections.some(s => s.id === i.section_id)
                                        );
                                        if (unsortedItems.length === 0 && sections.length > 0) return null;
                                        return (
                                            <>
                                                {sections.length > 0 && (
                                                    <div className="unsorted-header">
                                                        미분류 ({unsortedItems.length})
                                                    </div>
                                                )}
                                                {unsortedItems.map((item) => {
                                                    const globalIndex = items.findIndex(i => i.id === item.id);
                                                    return (
                                                        <SortableRundownItem
                                                            key={item.id}
                                                            item={item}
                                                            index={globalIndex}
                                                            isSelected={selectedItemId === item.id}
                                                            hasResolutionWarning={checkResolutionWarning(item)}
                                                            onSelect={() => setSelectedItemId(item.id)}
                                                            onPlay={() => handlePlayItem(item)}
                                                            onDelete={() => handleDeleteItem(item.id)}
                                                        />
                                                    );
                                                })}
                                            </>
                                        );
                                    })()}
                                </SortableContext>
                            </DndContext>
                        )}
                    </div>
                </main>

                {/* 오른쪽: 미리보기 + 속성 (리사이즈 가능) */}
                <aside
                    className="preview-panel"
                    style={{ width: previewWidth, minWidth: 200, maxWidth: 600 }}
                >
                    {/* 리사이저 핸들 */}
                    <div
                        className="resizer-handle"
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: "8px",
                            cursor: "ew-resize",
                            background: isResizing ? "var(--accent-primary)" : "var(--border-subtle)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "background 0.15s",
                            zIndex: 10,
                        }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            setIsResizing(true);
                        }}
                        onMouseEnter={(e) => {
                            (e.target as HTMLElement).style.background = "var(--accent-primary)";
                        }}
                        onMouseLeave={(e) => {
                            if (!isResizing) {
                                (e.target as HTMLElement).style.background = "var(--border-subtle)";
                            }
                        }}
                    >
                        {/* 세로 점 3개 (그립 아이콘) */}
                        <div style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            pointerEvents: "none",
                        }}>
                            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-tertiary)" }} />
                            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-tertiary)" }} />
                            <div style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--text-tertiary)" }} />
                        </div>
                    </div>
                    <div className="preview-section">
                        <h3>미리보기</h3>
                        <div className="preview-canvas">
                            {selectedItem ? (
                                // 그래픽 타입이고 data에 elements가 있으면 SVG 렌더링
                                selectedItem.source_type === "graphic" && selectedItem.data?.elements ? (
                                    <GraphicPreviewRenderer
                                        elements={selectedItem.data.elements as GraphicElement[]}
                                    />
                                ) : selectedItem.thumbnail ? (
                                    <img src={selectedItem.thumbnail} alt="" />
                                ) : (
                                    <div className="preview-placeholder">
                                        <span>{selectedItem.source_name}</span>
                                    </div>
                                )
                            ) : (
                                <div className="preview-empty">
                                    아이템을 선택하세요
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="properties-section">
                        <h3>속성</h3>
                        {selectedItem ? (
                            <div className="properties-form">
                                <div className="property-group">
                                    <label>이름</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={selectedItem.source_name}
                                        readOnly
                                    />
                                </div>
                                <div className="property-group">
                                    <label>지속 시간 (초)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={selectedItem.duration}
                                        min={1}
                                        onChange={(e) => {
                                            const newDuration = parseInt(e.target.value) || 5;
                                            setItems(prev =>
                                                prev.map(i =>
                                                    i.id === selectedItem.id
                                                        ? { ...i, duration: newDuration }
                                                        : i
                                                )
                                            );
                                        }}
                                    />
                                </div>
                                <div className="property-group">
                                    <label>타입</label>
                                    <span className="property-value">{selectedItem.source_type}</span>
                                </div>

                                {selectedItem.source_type === "overlay" && selectedOverlaySchemaEntries.length > 0 && (
                                    <>
                                        <div className="property-divider" />
                                        <h4 style={{ margin: "0.5rem 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                            오버레이 데이터
                                        </h4>
                                        {selectedOverlaySchemaEntries.map(([fieldKey, property]) => {
                                            const fieldType = typeof property.type === "string" ? property.type : "string";
                                            const value = Object.prototype.hasOwnProperty.call(selectedOverlayData, fieldKey)
                                                ? selectedOverlayData[fieldKey]
                                                : getSchemaDefaultValue(property);
                                            const label = typeof property.title === "string" ? property.title : fieldKey;
                                            const description = typeof property.description === "string" ? property.description : undefined;
                                            const updateValue = (nextValue: unknown) => {
                                                setItems(prev =>
                                                    prev.map(item =>
                                                        item.id === selectedItem.id
                                                            ? { ...item, data: setOverlayReplicantValue(item.data, fieldKey, nextValue) }
                                                            : item
                                                    )
                                                );
                                            };

                                            return (
                                                <div className="property-group" key={fieldKey}>
                                                    <label title={description}>{label}</label>
                                                    {fieldType === "boolean" ? (
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(value)}
                                                            onChange={(e) => updateValue(e.target.checked)}
                                                        />
                                                    ) : Array.isArray(property.enum) ? (
                                                        <select
                                                            className="input"
                                                            value={String(value ?? "")}
                                                            onChange={(e) => updateValue(e.target.value)}
                                                            title={description}
                                                        >
                                                            {(property.enum as unknown[]).map((option) => (
                                                                <option key={String(option)} value={String(option)}>
                                                                    {String(option)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : fieldType === "number" ? (
                                                        <input
                                                            type="number"
                                                            className="input"
                                                            value={Number(value ?? 0)}
                                                            min={typeof property.minimum === "number" ? property.minimum : typeof property.min === "number" ? property.min : undefined}
                                                            max={typeof property.maximum === "number" ? property.maximum : typeof property.max === "number" ? property.max : undefined}
                                                            step={typeof property.step === "number" ? property.step : undefined}
                                                            onChange={(e) => updateValue(Number(e.target.value))}
                                                            title={description}
                                                        />
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            className="input"
                                                            value={String(value ?? "")}
                                                            onChange={(e) => updateValue(e.target.value)}
                                                            placeholder={fieldKey}
                                                            title={description}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </>
                                )}

                                {/* 섹션 소속 변경 드롭다운 */}
                                {sections.length > 0 && (
                                    <div className="property-group">
                                        <label>섹션</label>
                                        <select
                                            className="input"
                                            value={selectedItem.section_id || ""}
                                            onChange={(e) => {
                                                const newSectionId = e.target.value || null;
                                                setItems(prev =>
                                                    prev.map(i =>
                                                        i.id === selectedItem.id
                                                            ? { ...i, section_id: newSectionId }
                                                            : i
                                                    )
                                                );
                                            }}
                                            style={{
                                                background: "var(--app-bg)",
                                                color: "var(--text-primary)",
                                                border: "1px solid var(--border-default)",
                                                borderRadius: "6px",
                                                padding: "0.375rem 0.5rem",
                                                fontSize: "0.8125rem",
                                                width: "100%",
                                            }}
                                        >
                                            <option value="">미분류</option>
                                            {sections.map(s => (
                                                <option key={s.id} value={s.id}>{s.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* ─── 트랙 레이어 (Wrap/Main) ─── */}
                                {/* ■ Why?
                                     속성 패널에서 아이템의 트랙 역할을 수동으로 변경 가능.
                                     Wrap CG ↔ Main CG 전환 + Wrap 소속 선택. */}
                                {selectedItem.section_id && (
                                    <>
                                        <div className="property-group">
                                            <label>트랙 역할</label>
                                            <select
                                                className="input"
                                                value={selectedItem.track_layer || "main"}
                                                onChange={(e) => {
                                                    const newLayer = e.target.value as "wrap" | "main";
                                                    if (newLayer === "wrap") {
                                                        handleToggleWrap(selectedItem.id);
                                                    } else {
                                                        // Wrap → Main 전환 시 자식들 해제
                                                        setItems(prev => prev.map(i => {
                                                            if (i.id === selectedItem.id) return { ...i, track_layer: "main", parent_item_id: null };
                                                            if (i.parent_item_id === selectedItem.id) return { ...i, parent_item_id: null };
                                                            return i;
                                                        }));
                                                    }
                                                }}
                                                style={{
                                                    background: "var(--app-bg)",
                                                    color: "var(--text-primary)",
                                                    border: "1px solid var(--border-default)",
                                                    borderRadius: "6px",
                                                    padding: "0.375rem 0.5rem",
                                                    fontSize: "0.8125rem",
                                                    width: "100%",
                                                }}
                                            >
                                                <option value="main">Main CG (자막, Track 2)</option>
                                                <option value="wrap">Wrap CG (배경판, Track 1)</option>
                                            </select>
                                        </div>

                                        {/* Wrap 소속 선택 (Main CG일 때만 표시) */}
                                        {selectedItem.track_layer !== "wrap" && (() => {
                                            const availableWraps = items.filter(
                                                i => i.track_layer === "wrap" && i.section_id === selectedItem.section_id
                                            );
                                            if (availableWraps.length === 0) return null;
                                            return (
                                                <div className="property-group">
                                                    <label>소속 Wrap CG</label>
                                                    <select
                                                        className="input"
                                                        value={selectedItem.parent_item_id || ""}
                                                        onChange={(e) => handleSetParent(selectedItem.id, e.target.value || null)}
                                                        style={{
                                                            background: "var(--app-bg)",
                                                            color: "var(--text-primary)",
                                                            border: "1px solid var(--border-default)",
                                                            borderRadius: "6px",
                                                            padding: "0.375rem 0.5rem",
                                                            fontSize: "0.8125rem",
                                                            width: "100%",
                                                        }}
                                                    >
                                                        <option value="">없음 (독립)</option>
                                                        {availableWraps.map(w => (
                                                            <option key={w.id} value={w.id}>{w.source_name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            );
                                        })()}
                                    </>
                                )}
                                {/* 그래픽의 텍스트 요소 편집 */}
                                {selectedItem.source_type === "graphic" &&
                                    selectedItem.data?.elements &&
                                    getTextElements(selectedItem.data.elements as GraphicElement[]).length > 0 && (
                                        <>
                                            <div className="property-divider" />
                                            <h4 style={{ margin: "0.5rem 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                                                텍스트 편집
                                            </h4>
                                            {getTextElements(selectedItem.data.elements as GraphicElement[]).map((textEl) => (
                                                <div className="property-group" key={textEl.id}>
                                                    <label>{textEl.name}</label>
                                                    <input
                                                        type="text"
                                                        className="input"
                                                        value={textEl.content || ""}
                                                        onChange={(e) => {
                                                            const newContent = e.target.value;
                                                            // elements 배열에서 해당 요소 업데이트
                                                            const updatedElements = (selectedItem.data.elements as GraphicElement[]).map(
                                                                (el) => el.id === textEl.id ? { ...el, content: newContent } : el
                                                            );
                                                            // items 상태 업데이트
                                                            setItems(prev =>
                                                                prev.map(item =>
                                                                    item.id === selectedItem.id
                                                                        ? { ...item, data: { ...item.data, elements: updatedElements } }
                                                                        : item
                                                                )
                                                            );
                                                        }}
                                                        placeholder="텍스트 입력"
                                                    />
                                                </div>
                                            ))}
                                        </>
                                    )}
                            </div>
                        ) : (
                            <div className="properties-empty">
                                아이템을 선택하면<br />속성을 편집할 수 있습니다.
                            </div>
                        )}
                    </div>
                </aside>

                {showPreview && (
                    <div
                        style={{
                            position: "fixed", inset: 0, zIndex: 9999,
                            backgroundColor: "rgba(0,0,0,0.85)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexDirection: "column",
                        }}
                        onClick={() => setShowPreview(false)}
                    >
                        <div
                            style={{
                                position: "relative",
                                width: "min(90vw, 1280px)",
                                aspectRatio: "16/9",
                                backgroundColor: "#000",
                                borderRadius: "8px",
                                overflow: "hidden",
                                boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {previewLoading && (
                                <div style={{
                                    position: "absolute", inset: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#94a3b8", fontSize: "14px", zIndex: 2,
                                }}>
                                    <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />
                                    오버레이 로딩 중...
                                </div>
                            )}
                            {previewCode && (
                                <iframe
                                    ref={previewIframeRef}
                                    sandbox="allow-scripts"
                                    srcDoc={buildPreviewSrcdoc(previewCode.html, previewCode.css, previewCode.js)}
                                    style={{
                                        width: "1920px", height: "1080px",
                                        border: "none", background: "transparent",
                                        transformOrigin: "top left",
                                        transform: "scale(0.667)",
                                        position: "absolute", top: 0, left: 0,
                                    }}
                                    title="Animation Preview"
                                    onLoad={triggerPreviewShow}
                                />
                            )}
                            {!previewLoading && !previewCode && (
                                <div style={{
                                    position: "absolute", inset: 0,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#94a3b8", fontSize: "14px",
                                }}>
                                    오버레이를 찾을 수 없습니다
                                </div>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                            {previewCode && (
                                <button
                                    type="button"
                                    onClick={triggerPreviewShow}
                                    style={{
                                        padding: "8px 20px", borderRadius: "6px",
                                        border: "none", cursor: "pointer",
                                        background: "linear-gradient(135deg, #06b6d4, #0ea5e9)",
                                        color: "white", fontSize: "13px", fontWeight: 600,
                                        display: "flex", alignItems: "center", gap: "6px",
                                    }}
                                >
                                    <Play size={14} /> 다시 재생
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setShowPreview(false)}
                                style={{
                                    padding: "8px 20px", borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.15)",
                                    background: "transparent", color: "#94a3b8",
                                    cursor: "pointer", fontSize: "13px", fontWeight: 600,
                                }}
                            >
                                닫기
                            </button>
                        </div>
                        {previewItem && (
                            <div style={{ marginTop: "8px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
                                {previewItem.source_name} · {previewItem.duration}s
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
