/**
 * Broadcast Graphics (방송 그래픽) Rundown Editor Page Lazy Component
 * SPX-GC 스타일 3-Pane Layout: 그래픽 라이브러리 | 런다운 | 미리보기+속성
 */

import {
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	Download,
	FolderPlus,
	HelpCircle,
	Loader2,
	Play,
	Save,
	Upload,
} from "lucide-react";
import {
	type ChangeEvent,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { importOgrafPackageFromFiles } from "@/lib/ografPackageImporter";
import { createOgrafLowerThirdLibraryItem } from "@/lib/ografSamples";
import { mapRundownItemsToCuesheetItems } from "@/lib/rundownPreflightAdapter";
import { buildRundownQualitySummary } from "@/lib/rundownQualityGate";
import {
	type CuesheetReusePolicy,
	createCuesheetContentHash,
	fetchLatestCuesheetValidationReport,
	isValidationReportStale,
	saveCuesheetValidationReport,
} from "@/services/cuesheetCheckService";
import { runPreflight } from "@/services/preflightService";
import { BroadcastGuideModal } from "../../../components/Broadcast/BroadcastGuideModal";
import {
	type GraphicElement,
	getEditableTextElements,
} from "../../../components/GraphicPreviewRenderer";
import { LibraryPanel } from "../../../components/Rundown/LibraryPanel";
import { PreviewPanel } from "../../../components/Rundown/PreviewPanel";
import { PropertiesPanel } from "../../../components/Rundown/PropertiesPanel";
import {
	type LibraryItem,
	type LibraryTab,
	RundownEditorProvider,
} from "../../../components/Rundown/RundownEditorContext";
import { RundownListPanel } from "../../../components/Rundown/RundownListPanel";
import { useAuth } from "../../../lib/auth";
import {
	buildOverlayReplicantData,
	getDashboardSchemaProperties,
} from "../../../lib/rundownOverlayData";
import { supabase } from "../../../lib/supabase";
import { buildPluginSrcdoc } from "../../../lib/webcgkSrcdoc";
import {
	buildRundownPackageFilename,
	exportRundownPackage,
	importRundownPackage,
	parseRundownPackage,
	RUNDOWN_PACKAGE_MIME,
	serializeRundownPackage,
} from "../../../services/rundownPackageService";
import {
	addRundownItem,
	createBroadcastSession,
	fetchRundownItems,
	fetchRundownMeta,
	fetchRundownSectionImportCandidates,
	fetchRundownSectionImportPayload,
	type RundownItem,
	type RundownMeta,
	type RundownSection,
	type RundownSectionImportCandidate,
	removeRundownItem,
	type SectionImportScope,
	saveRundownItems,
	updateRundownSections,
	updateRundownTitle,
} from "../../../services/rundownRepository";

export const Route = createLazyFileRoute("/dashboard/rundowns/$rundownId")({
	component: RundownEditorPage,
});

// 섹션 컬러 팔레트 — 세그먼트별 시각적 구분
// ■ Why 12색? Premiere Pro의 Nested Sequence 색상 팔레트 참고
const SECTION_COLORS = [
	"rgba(59, 130, 246, 0.12)", // 파랑
	"rgba(16, 185, 129, 0.12)", // 초록
	"rgba(245, 158, 11, 0.12)", // 주황
	"rgba(139, 92, 246, 0.12)", // 보라
	"rgba(236, 72, 153, 0.12)", // 핑크
	"rgba(6, 182, 212, 0.12)", // 시안
	"rgba(234, 179, 8, 0.12)", // 노랑
	"rgba(239, 68, 68, 0.12)", // 빨강
	"rgba(34, 197, 94, 0.12)", // 라임
	"rgba(168, 85, 247, 0.12)", // 인디고
	"rgba(251, 146, 60, 0.12)", // 암버
	"rgba(20, 184, 166, 0.12)", // 틸
];

// 배열 순서 변경 유틸리티
function arrayMove<T>(array: T[], from: number, to: number): T[] {
	const newArray = array.slice();
	const [removed] = newArray.splice(from, 1);
	newArray.splice(to, 0, removed);
	return newArray;
}

function buildUniqueSectionLabel(
	baseLabel: string,
	existingSections: RundownSection[],
): string {
	const normalizedBase = baseLabel.trim() || "가져온 섹션";
	const usedLabels = new Set(
		existingSections.map((section) => section.label.trim()),
	);
	if (!usedLabels.has(normalizedBase)) return normalizedBase;

	let index = 2;
	while (usedLabels.has(`${normalizedBase} (${index})`)) {
		index += 1;
	}
	return `${normalizedBase} (${index})`;
}

function formatByteCount(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	return `${(kb / 1024).toFixed(2)} MB`;
}

function RundownEditorPage() {
	const { rundownId } = Route.useParams();
	const navigate = useNavigate();
	const { user, activeWorkspaceId } = useAuth();
	const queryClient = useQueryClient();

	// ─── 상태 선언 ───
	const [loading, setLoading] = useState(true);
	const [rundown, setRundown] = useState<RundownMeta | null>(null);
	const [items, setItems] = useState<RundownItem[]>([]);
	const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [reusePolicy, setReusePolicy] =
		useState<CuesheetReusePolicy>("reusable");
	const [approvingCheck, setApprovingCheck] = useState(false);

	// 런다운의 NrcsCuesheetItem 에뮬레이션 리스트 계산
	const cuesheetItems = useMemo(() => {
		return mapRundownItemsToCuesheetItems(items);
	}, [items]);

	const currentContentHash = useMemo(() => {
		return createCuesheetContentHash({
			programDate: new Date().toISOString().split("T")[0],
			items: cuesheetItems,
		});
	}, [cuesheetItems]);

	const { data: latestValidation } = useQuery({
		queryKey: ["rundownValidation", rundownId],
		queryFn: () => fetchLatestCuesheetValidationReport(rundownId),
	});

	const validationStale = isValidationReportStale(
		latestValidation,
		currentContentHash,
		reusePolicy,
	);

	// 🆕 프리플라이트 검증 쿼리 (런다운 아이템 대상)
	const {
		data: preflightReport,
		isLoading: preflightLoading,
		refetch: refetchPreflight,
	} = useQuery({
		queryKey: ["preflight_rundown", rundownId, reusePolicy, currentContentHash],
		queryFn: () => {
			return runPreflight(
				cuesheetItems,
				null,
				new Date().toISOString().split("T")[0],
				{
					reusePolicy,
					originalAirDate: new Date().toISOString().split("T")[0],
					targetAirDate: new Date().toISOString().split("T")[0],
					requireBundle: false,
				},
			);
		},
		enabled: items.length > 0,
	});

	const qualitySummary = useMemo(
		() =>
			buildRundownQualitySummary({
				items,
				report: preflightReport ?? null,
			}),
		[items, preflightReport],
	);

	const handleApproveCheck = async () => {
		if (
			!preflightReport ||
			preflightReport.validationStatus === "blocked" ||
			qualitySummary.status === "error"
		)
			return;
		setApprovingCheck(true);
		try {
			const validationStatus =
				qualitySummary.status === "warning"
					? "needs_review"
					: preflightReport.validationStatus;
			await saveCuesheetValidationReport({
				cuesheetId: rundownId,
				status: validationStatus,
				contentHash: preflightReport.contentHash,
				context: {
					...preflightReport.checkContext,
					checkedAt: new Date().toISOString(),
				},
				report: {
					...preflightReport,
					qualitySummary,
				},
			});
			queryClient.invalidateQueries({
				queryKey: ["rundownValidation", rundownId],
			});
			alert(
				validationStatus === "passed"
					? "✅ 런다운 체크 승인 완료"
					: "✅ 경고 포함 런다운 체크 승인 완료",
			);
		} catch (err) {
			console.error("런다운 체크 승인 실패:", err);
			alert("⚠️ 런다운 체크 승인 실패");
		}
		setApprovingCheck(false);
	};
	const [isCreatingSession, setIsCreatingSession] = useState(false);
	const [isExportingPackage, setIsExportingPackage] = useState(false);
	const [isImportingPackage, setIsImportingPackage] = useState(false);
	const [isImportingOgrafPackage, setIsImportingOgrafPackage] = useState(false);
	const packageInputRef = useRef<HTMLInputElement | null>(null);
	const ografPackageInputRef = useRef<HTMLInputElement | null>(null);

	// 라이브러리 상태
	const [activeTab, setActiveTab] = useState<LibraryTab>("graphics");
	const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
	const [importedOgrafLibraryItems, setImportedOgrafLibraryItems] = useState<
		LibraryItem[]
	>([]);
	const [libraryLoading, setLibraryLoading] = useState(false);
	const [sectionImportCandidates, setSectionImportCandidates] = useState<
		RundownSectionImportCandidate[]
	>([]);
	const [sectionImportSearch, setSectionImportSearch] = useState("");
	const deferredSectionImportSearch = useDeferredValue(sectionImportSearch);
	const [sectionImportScope, setSectionImportScope] =
		useState<SectionImportScope>("all");
	const [importingSectionKey, setImportingSectionKey] = useState<string | null>(
		null,
	);

	// 미리보기 패널 리사이즈 상태
	const [previewWidth, setPreviewWidth] = useState(300);
	const [isResizing, setIsResizing] = useState(false);

	// 클립보드 (복사된 아이템)
	const [copiedItem, setCopiedItem] = useState<RundownItem | null>(null);

	// 섹션 상태
	const [sections, setSections] = useState<RundownSection[]>([]);
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set(),
	);

	// 활성 섹션 (Google My Maps 레이어 선택 패턴)
	const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

	// 애니메이션 프리뷰 모달 상태
	const [showPreview, setShowPreview] = useState(false);
	const [previewItem, setPreviewItem] = useState<RundownItem | null>(null);
	const [previewCode, setPreviewCode] = useState<{
		html: string;
		css: string;
		js: string;
	} | null>(null);

	// 사용 가이드 모달 상태
	const [isGuideOpen, setIsGuideOpen] = useState(false);
	const [previewLoading, setPreviewLoading] = useState(false);
	const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

	// ─── 비즈니스 액션 구현 ───

	// 섹션 추가
	const handleAddSection = () => {
		const newSection: RundownSection = {
			id: `sec-${Date.now()}`,
			label: `SECTION ${sections.length + 1}`,
			order: sections.length,
			color: SECTION_COLORS[sections.length % SECTION_COLORS.length],
		};
		setSections((prev) => [...prev, newSection]);
	};

	// 섹션 삭제 — 소속 아이템의 section_id를 null로 초기화
	const handleDeleteSection = (sectionId: string) => {
		setSections((prev) => prev.filter((s) => s.id !== sectionId));
		setItems((prev) =>
			prev.map((item) =>
				item.section_id === sectionId ? { ...item, section_id: null } : item,
			),
		);
	};

	// 섹션 이름 변경
	const handleRenameSection = (sectionId: string, newLabel: string) => {
		setSections((prev) =>
			prev.map((s) => (s.id === sectionId ? { ...s, label: newLabel } : s)),
		);
	};

	// 섹션 접기/펼치기 토글
	const toggleSectionCollapse = (sectionId: string) => {
		setCollapsedSections((prev) => {
			const next = new Set(prev);
			if (next.has(sectionId)) next.delete(sectionId);
			else next.add(sectionId);
			return next;
		});
	};

	// 아이템을 Wrap CG로 전환 (toggle)
	const handleToggleWrap = (itemId: string) => {
		setItems((prev) => {
			const item = prev.find((i) => i.id === itemId);
			if (!item) return prev;

			const isCurrentlyWrap = item.track_layer === "wrap";
			if (isCurrentlyWrap) {
				return prev.map((i) => {
					if (i.id === itemId)
						return { ...i, track_layer: null, parent_item_id: null };
					if (i.parent_item_id === itemId)
						return { ...i, parent_item_id: null };
					return i;
				});
			} else {
				return prev.map((i) => {
					if (i.id === itemId) return { ...i, track_layer: "wrap" as const };
					return i;
				});
			}
		});
	};

	// 자식 아이템의 부모(Wrap CG) 설정/해제
	const handleSetParent = (childId: string, parentId: string | null) => {
		setItems((prev) =>
			prev.map((i) =>
				i.id === childId ? { ...i, parent_item_id: parentId } : i,
			),
		);
	};

	// Wrap CG 삭제 시 자식을 orphan 복구 및 아이템 실물 삭제
	const handleDeleteItemWithOrphanRecovery = async (id: string) => {
		if (!confirm("이 항목을 삭제하시겠습니까?")) return;

		try {
			await removeRundownItem(id);
		} catch (error) {
			console.error("Error deleting item:", error);
			return;
		}

		setItems((prev) => {
			const deletedItem = prev.find((i) => i.id === id);
			return prev
				.filter((i) => i.id !== id)
				.map((i) => {
					if (deletedItem?.track_layer === "wrap" && i.parent_item_id === id) {
						return { ...i, parent_item_id: null };
					}
					return i;
				});
		});
		if (selectedItemId === id) setSelectedItemId(null);
	};

	const hasLoadedRef = useRef(false);

	// 데이터 로딩 (최초 1회 및 rundownId 변경 시)
	// biome-ignore lint/correctness/useExhaustiveDependencies: rundownId 변화에 맞춰 load gate만 리셋한다.
	useEffect(() => {
		hasLoadedRef.current = false;
	}, [rundownId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: loadRundownData는 route-local 함수라 의존성에 넣으면 중복 로드가 발생한다.
	useEffect(() => {
		if (!user || hasLoadedRef.current) return;
		hasLoadedRef.current = true;
		loadRundownData();
	}, [rundownId, user?.id]);

	// 탭 변경 시 라이브러리 로드
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeTab/user 변경 때만 라이브러리 패치를 재시도한다.
	useEffect(() => {
		if (!user || activeTab !== "graphics") return;
		loadLibraryData();
	}, [activeTab, user?.id]);

	// 섹션 가져오기 검색
	// biome-ignore lint/correctness/useExhaustiveDependencies: 검색 입력과 섹션 탭 조건만으로 패치 타이밍을 고정한다.
	useEffect(() => {
		if (!user || activeTab !== "sections") return;
		loadSectionImportCandidates();
	}, [
		activeTab,
		user?.id,
		activeWorkspaceId,
		deferredSectionImportSearch,
		sectionImportScope,
		rundownId,
	]);

	// 미리보기 패널 리사이즈 핸들러
	useEffect(() => {
		if (!isResizing) return;

		const handleMouseMove = (e: MouseEvent) => {
			const newWidth = window.innerWidth - e.clientX;
			setPreviewWidth(Math.max(240, Math.min(520, newWidth)));
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

	// ⚡ 런다운 아이템 선택 시 실시간 미리보기 오버레이 코드 로드
	useEffect(() => {
		if (!selectedItemId) {
			setPreviewCode(null);
			return;
		}

		const item = items.find((i) => i.id === selectedItemId);
		if (!item) {
			setPreviewCode(null);
			return;
		}

		// 오버레이 및 템플릿 타입일 때만 DB에서 오버레이 코드를 비동기 조회
		if (item.source_type !== "overlay" && item.source_type !== "template") {
			setPreviewCode(null);
			return;
		}

		let active = true;
		const loadPreviewCode = async () => {
			setPreviewLoading(true);
			try {
				const { data: template, error } = await supabase
					.from("overlay_templates")
					.select("source_code")
					.eq("id", item.source_id)
					.single();

				if (active && template && !error) {
					const sourceCode = (template as any).source_code || {};
					setPreviewCode({
						html: sourceCode.html || "",
						css: sourceCode.css || "",
						js: sourceCode.js || "",
					});
				} else if (active) {
					setPreviewCode(null);
				}
			} catch (err) {
				console.error("Failed to load overlay preview code:", err);
				if (active) setPreviewCode(null);
			} finally {
				if (active) setPreviewLoading(false);
			}
		};

		loadPreviewCode();

		return () => {
			active = false;
		};
	}, [selectedItemId, items]);

	// 키보드 단축키 핸들러
	// biome-ignore lint/correctness/useExhaustiveDependencies: 키보드 핸들러는 현재 선택/복사 상태만 반영하고 route-local 액션 재생성에는 반응하지 않는다.
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement
			) {
				return;
			}

			const currentIndex = items.findIndex((i) => i.id === selectedItemId);

			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					if (currentIndex > 0) {
						setSelectedItemId(items[currentIndex - 1].id);
					} else if (items.length > 0 && !selectedItemId) {
						setSelectedItemId(items[0].id);
					}
					break;

				case "ArrowDown":
					e.preventDefault();
					if (currentIndex < items.length - 1 && currentIndex >= 0) {
						setSelectedItemId(items[currentIndex + 1].id);
					} else if (items.length > 0 && !selectedItemId) {
						setSelectedItemId(items[0].id);
					}
					break;

				case " ": // Space
					e.preventDefault();
					if (items.length > 0) {
						if (currentIndex < items.length - 1) {
							setSelectedItemId(items[currentIndex + 1].id);
						} else {
							setSelectedItemId(items[0].id);
						}
					}
					break;

				case "Delete":
				case "Backspace":
					if (selectedItemId && !e.ctrlKey && !e.metaKey) {
						e.preventDefault();
						handleDeleteItemWithOrphanRecovery(selectedItemId);
					}
					break;

				case "c":
					if ((e.ctrlKey || e.metaKey) && selectedItem) {
						e.preventDefault();
						setCopiedItem({ ...selectedItem });
					}
					break;

				case "v":
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
				const { data: graphics, error } = await supabase
					.from("graphics")
					.select("id, name, thumbnail_path, template_data")
					.or(`owner_id.eq.${user!.id},is_public.eq.true`)
					.order("updated_at", { ascending: false })
					.limit(50);

				if (!error && graphics) {
					data = (graphics as any[]).map((g) => {
						let thumbnailUrl: string | undefined;
						if (g.thumbnail_path) {
							const { data: urlData } = supabase.storage
								.from("graphics")
								.getPublicUrl(g.thumbnail_path);
							thumbnailUrl = urlData?.publicUrl;
						}
						return {
							id: g.id,
							name: g.name,
							source_type: "graphic" as const,
							thumbnail: thumbnailUrl,
							data: {
								elements: g.template_data?.elements || [],
								canvas_size: g.template_data?.canvas_size || {
									width: 1920,
									height: 1080,
								},
							},
						};
					});
				}

				data = [
					...importedOgrafLibraryItems,
					createOgrafLowerThirdLibraryItem(),
					...data,
				];
			}

			setLibraryItems(data);
		} catch (error) {
			console.error("Error loading library:", error);
		} finally {
			setLibraryLoading(false);
		}
	};

	const loadSectionImportCandidates = async () => {
		setLibraryLoading(true);
		try {
			const candidates = await fetchRundownSectionImportCandidates({
				targetRundownId: rundownId,
				workspaceId: activeWorkspaceId,
				scope: sectionImportScope,
				search: deferredSectionImportSearch,
			});
			setSectionImportCandidates(candidates);
		} catch (error) {
			console.error("Error loading reusable rundown sections:", error);
			setSectionImportCandidates([]);
		} finally {
			setLibraryLoading(false);
		}
	};

	// 라이브러리 아이템을 런다운에 추가 (컨텍스트 기반 다차원 자동 배치)
	const handleAddToRundown = async (item: LibraryItem) => {
		const selectedItem = items.find((i) => i.id === selectedItemId);
		let inheritSectionId: string | null = null;
		let inheritParentId: string | null = null;
		let insertAfterIndex = items.length - 1; // 기본: 맨 뒤

		if (selectedItem) {
			// 1순위: 선택된 아이템이 Wrap CG → 자식으로 삽입
			if (selectedItem.track_layer === "wrap") {
				inheritSectionId = selectedItem.section_id || null;
				inheritParentId = selectedItem.id;
				const wrapChildren = items.filter(
					(i) => i.parent_item_id === selectedItem.id,
				);
				if (wrapChildren.length > 0) {
					const lastChildIndex = Math.max(
						...wrapChildren.map((c) => items.findIndex((i) => i.id === c.id)),
					);
					insertAfterIndex = lastChildIndex;
				} else {
					insertAfterIndex = items.findIndex((i) => i.id === selectedItem.id);
				}
			}
			// 2순위: 선택된 아이템이 섹션에 속함 → 같은 섹션 뒤에 삽입
			else if (selectedItem.section_id) {
				inheritSectionId = selectedItem.section_id;
				insertAfterIndex = items.findIndex((i) => i.id === selectedItem.id);
			}
		}
		// 3순위: 활성 섹션이 있으면 해당 섹션 끝에 삽입
		else if (activeSectionId) {
			inheritSectionId = activeSectionId;
			const sectionItems = items.filter(
				(i) => i.section_id === activeSectionId,
			);
			if (sectionItems.length > 0) {
				const lastSectionItemIndex = Math.max(
					...sectionItems.map((si) => items.findIndex((i) => i.id === si.id)),
				);
				insertAfterIndex = lastSectionItemIndex;
			}
		}

		const newItem: Partial<RundownItem> = {
			source_type: item.source_type,
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
			setItems((prev) => {
				const next = [...prev];
				next.splice(insertAfterIndex + 1, 0, newRundownItem);
				return next;
			});

			const wasWrapSelected = selectedItem?.track_layer === "wrap";
			if (!wasWrapSelected) {
				setSelectedItemId(newRundownItem.id);
			}
		} catch (error) {
			console.error("Error adding item:", error);
		}
	};

	const handleImportSection = async (
		candidate: RundownSectionImportCandidate,
	) => {
		const importKey = `${candidate.source_rundown_id}:${candidate.section.id}`;
		setImportingSectionKey(importKey);

		try {
			const payload = await fetchRundownSectionImportPayload(
				candidate.source_rundown_id,
				candidate.section.id,
			);
			if (payload.items.length === 0) {
				alert("가져올 아이템이 없는 섹션입니다.");
				return;
			}

			const newSection: RundownSection = {
				id: `sec-${Date.now()}`,
				label: buildUniqueSectionLabel(payload.section.label, sections),
				order: sections.length,
				color:
					payload.section.color ||
					SECTION_COLORS[sections.length % SECTION_COLORS.length],
			};

			const sourceItems = [...payload.items].sort(
				(a, b) => a.item_order - b.item_order,
			);
			const idMap = new Map<string, string>();
			const insertedItems: RundownItem[] = [];

			for (const sourceItem of sourceItems) {
				const created = await addRundownItem(rundownId, {
					source_type: sourceItem.source_type,
					source_id: sourceItem.source_id,
					source_name: sourceItem.source_name,
					data: sourceItem.data ? { ...sourceItem.data } : {},
					item_order: items.length + insertedItems.length,
					duration: sourceItem.duration,
					thumbnail: sourceItem.thumbnail,
					section_id: newSection.id,
					track_layer: sourceItem.track_layer || null,
					parent_item_id: null,
				});
				idMap.set(sourceItem.id, created.id);
				insertedItems.push(created);
			}

			const remappedItems = insertedItems.map((createdItem, index) => {
				const sourceParentId = sourceItems[index].parent_item_id;
				if (!sourceParentId) return createdItem;
				const remappedParentId = idMap.get(sourceParentId);
				return remappedParentId
					? { ...createdItem, parent_item_id: remappedParentId }
					: createdItem;
			});

			const nextSections = [...sections, newSection];
			const nextItems = [...items, ...remappedItems];

			setSections(nextSections);
			setItems(nextItems);
			setSelectedItemId(remappedItems[0]?.id || null);

			await saveRundownItems(rundownId, nextItems);
			await updateRundownSections(rundownId, nextSections);
		} catch (error) {
			console.error("Error importing rundown section:", error);
			alert("섹션을 가져오는 중 오류가 발생했습니다.");
		} finally {
			setImportingSectionKey(null);
		}
	};

	// 아이템 붙여넣기
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

	const persistRundownState = async () => {
		await saveRundownItems(rundownId, items);
		await updateRundownSections(rundownId, sections);
	};

	const handleSave = async () => {
		setIsSaving(true);
		try {
			await persistRundownState();
			alert("저장되었습니다.");
		} catch (error) {
			console.error("Error saving:", error);
			alert("저장 중 오류가 발생했습니다.");
		} finally {
			setIsSaving(false);
		}
	};

	const handleExportPackage = async () => {
		setIsExportingPackage(true);
		try {
			await persistRundownState();
			const pkg = await exportRundownPackage(rundownId);
			const blob = new Blob([serializeRundownPackage(pkg)], {
				type: RUNDOWN_PACKAGE_MIME,
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = buildRundownPackageFilename(pkg.rundown.title);
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error exporting rundown package:", error);
			alert("큐시트 패키지를 내보내는 중 오류가 발생했습니다.");
		} finally {
			setIsExportingPackage(false);
		}
	};

	const handleImportPackageClick = () => {
		packageInputRef.current?.click();
	};

	const handleImportOgrafPackageClick = () => {
		ografPackageInputRef.current?.click();
	};

	const handleImportOgrafPackageFiles = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const files = event.target.files;
		event.target.value = "";
		if (!files || files.length === 0) return;

		const confirmed = confirm(
			"선택한 OGraf package의 JavaScript module을 신뢰된 방송 그래픽(Broadcast Graphics)으로 라이브러리에 추가합니다. 출처를 확인한 파일만 가져오세요.",
		);
		if (!confirmed) return;

		setIsImportingOgrafPackage(true);
		try {
			const imported = await importOgrafPackageFromFiles(Array.from(files));
			const importedItem: LibraryItem = {
				id: `ograf-import:${imported.id}:${Date.now()}`,
				name: imported.name,
				source_type: "ograf",
				thumbnail: null,
				data: imported.sourceData,
			};

			setActiveTab("graphics");
			setImportedOgrafLibraryItems((prev) => [importedItem, ...prev]);
			setLibraryItems((prev) => [importedItem, ...prev]);
			alert(
				[
					`OGraf package를 그래픽 라이브러리에 추가했습니다: ${imported.name}`,
					`Import mode: ${imported.compatibility.importMode}`,
					`Package size: ${formatByteCount(imported.compatibility.packageBytes)}`,
					`Inline module size: ${formatByteCount(imported.compatibility.inlineModuleBytes)}`,
					"이 항목은 WebCG-K 런다운 안의 OGraf sourceData snapshot입니다.",
					"런다운 내보내기는 OGraf package가 아니라 WebCG-K 전용 rundown JSON입니다.",
					...imported.compatibility.notes,
					...imported.warnings,
				].join("\n"),
			);
		} catch (error) {
			console.error("Error importing OGraf package:", error);
			alert(
				error instanceof Error
					? error.message
					: "OGraf package를 가져오는 중 오류가 발생했습니다.",
			);
		} finally {
			setIsImportingOgrafPackage(false);
		}
	};

	const handleImportPackageFile = async (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file || !user) return;

		const confirmed = confirm(
			"이 파일의 HTML 오버레이 방송 그래픽 코드를 포함해 새 큐시트로 가져옵니다. 신뢰할 수 있는 파일만 가져오세요.",
		);
		if (!confirmed) return;

		setIsImportingPackage(true);
		try {
			const raw = await file.text();
			const pkg = parseRundownPackage(raw);
			const result = await importRundownPackage(pkg, {
				userId: user.id,
				workspaceId: activeWorkspaceId,
			});
			alert(
				`가져오기가 완료되었습니다. ${result.itemCount}개 아이템을 복원했습니다.`,
			);
			navigate({ to: `/dashboard/rundowns/${result.rundownId}` });
		} catch (error) {
			console.error("Error importing rundown package:", error);
			alert(
				error instanceof Error
					? error.message
					: "큐시트 패키지를 가져오는 중 오류가 발생했습니다.",
			);
		} finally {
			setIsImportingPackage(false);
		}
	};

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

	const handlePlayItem = async (item: RundownItem) => {
		if (item.source_type === "ograf") {
			setSelectedItemId(item.id);
			setPreviewItem(item);
			setPreviewCode(null);
			setPreviewLoading(false);
			setShowPreview(true);
			return;
		}

		if (item.source_type !== "overlay" && item.source_type !== "template") {
			alert(
				"현재 오버레이/템플릿/OGraf 아이템만 애니메이션 미리보기를 지원합니다.",
			);
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

	const buildPreviewSrcdoc = (html: string, css: string, js: string) => {
		return buildPluginSrcdoc({
			html,
			css,
			js,
			autoShow: false,
			previewBackground: "checkerboard",
		});
	};

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
		}),
	);

	// 드래그 종료 시 순서 변경 + 섹션 자동 배정
	const handleDragEnd = (event: any) => {
		const { active, over } = event;
		if (!over) return;

		const overData = over.data?.current as { sectionId?: string } | undefined;
		if (overData?.sectionId) {
			setItems((prev) =>
				prev.map((item) =>
					item.id === active.id
						? { ...item, section_id: overData.sectionId }
						: item,
				),
			);
			return;
		}

		if (active.id !== over.id) {
			setItems((prev) => {
				const oldIndex = prev.findIndex((i) => i.id === active.id);
				const newIndex = prev.findIndex((i) => i.id === over.id);
				if (oldIndex === -1 || newIndex === -1) return prev;

				const targetItem = prev[newIndex];
				const movedItems = arrayMove(prev, oldIndex, newIndex);
				if (targetItem.section_id) {
					return movedItems.map((item) =>
						item.id === active.id
							? { ...item, section_id: targetItem.section_id }
							: item,
					);
				}
				return movedItems;
			});
		}
	};

	// ─── 파생 상태 산출 ───
	const selectedItem = items.find((i) => i.id === selectedItemId);
	const selectedOverlaySchemaProperties =
		selectedItem?.source_type === "overlay"
			? getDashboardSchemaProperties(selectedItem.data)
			: {};
	const selectedOverlaySchemaEntries = Object.entries(
		selectedOverlaySchemaProperties,
	);
	const selectedOverlayData =
		selectedItem?.source_type === "overlay"
			? buildOverlayReplicantData(selectedItem.data)
			: {};
	const selectedGraphicElements =
		selectedItem?.source_type === "graphic" &&
		Array.isArray(selectedItem.data?.elements)
			? (selectedItem.data.elements as GraphicElement[])
			: [];
	const selectedEditableTextElements = getEditableTextElements(
		selectedGraphicElements,
	);

	const updateSelectedGraphicElements = (
		updater: (elements: GraphicElement[]) => GraphicElement[],
	) => {
		if (!selectedItem) return;
		setItems((prev) =>
			prev.map((item) =>
				item.id === selectedItem.id
					? {
							...item,
							data: {
								...item.data,
								elements: updater(
									(item.data?.elements as GraphicElement[]) || [],
								),
							},
						}
					: item,
			),
		);
	};

	// ─── Context API 패키징 ───
	const stateObj = {
		rundownId,
		loading,
		rundown,
		items,
		selectedItemId,
		isSaving,
		isCreatingSession,
		isExportingPackage,
		isImportingPackage,
		activeTab,
		libraryItems,
		libraryLoading,
		sectionImportCandidates,
		sectionImportSearch,
		sectionImportScope,
		importingSectionKey,
		previewWidth,
		isResizing,
		copiedItem,
		sections,
		collapsedSections,
		activeSectionId,
		showPreview,
		previewItem,
		previewCode,
		isGuideOpen,
		previewLoading,
		qualitySummary,
		qualityLoading: preflightLoading,
		qualityValidationStale: !!latestValidation && validationStale,
		qualityValidationApproved:
			!!latestValidation &&
			!validationStale &&
			latestValidation.status !== "blocked",
		qualityApproving: approvingCheck,
		reusePolicy,
		selectedItem,
		selectedOverlaySchemaEntries,
		selectedOverlayData,
		selectedGraphicElements,
		selectedEditableTextElements,
	};

	const actionsObj = {
		setRundown,
		setItems,
		setSelectedItemId,
		setActiveTab,
		setSectionImportSearch,
		setSectionImportScope,
		setPreviewWidth,
		setIsResizing,
		setCollapsedSections,
		setActiveSectionId,
		setShowPreview,
		setIsGuideOpen,
		handleAddSection,
		handleDeleteSection,
		handleRenameSection,
		toggleSectionCollapse,
		handleToggleWrap,
		handleSetParent,
		handleDeleteItemWithOrphanRecovery,
		handleAddToRundown,
		handleImportSection,
		handlePlayItem,
		triggerPreviewShow,
		updateSelectedGraphicElements,
		sensors,
		handleDragEnd,
		handleSave,
		handleExportPackage,
		handleImportPackageClick,
		handleImportPackageFile,
		handleCreateSession,
		refetchQualityGate: () => {
			void refetchPreflight();
		},
		handleApproveQualityGate: handleApproveCheck,
		setReusePolicy,
		packageInputRef,
		previewIframeRef,
	};

	if (loading) {
		return (
			<div className="rundown-editor-loading">
				<Loader2 className="animate-spin" size={32} />
			</div>
		);
	}

	return (
		<RundownEditorProvider state={stateObj} actions={actionsObj}>
			<div className="rundown-editor">
				{/* 헤더 */}
				<header className="rundown-editor-header">
					<div className="header-left">
						<Link to="/dashboard/rundowns" className="back-btn">
							<ChevronLeft size={20} />
						</Link>
						<div className="header-info">
							<input
								type="text"
								className="header-title-input"
								value={rundown?.title || ""}
								onChange={(e) => {
									if (rundown)
										setRundown({ ...rundown, title: e.target.value });
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
							variant="ghost"
							className="gap-1.5 text-text-secondary hover:text-text-primary"
							onClick={() => setIsGuideOpen(true)}
						>
							<HelpCircle size={18} />
							사용법
						</Button>
						<div className="header-divider" />
						<Button
							variant="secondary"
							onClick={handleSave}
							disabled={
								isSaving ||
								isExportingPackage ||
								isImportingPackage ||
								isImportingOgrafPackage
							}
						>
							{isSaving ? (
								<Loader2 className="animate-spin" size={18} />
							) : (
								<Save size={18} />
							)}
							저장
						</Button>
						<Button
							variant="secondary"
							onClick={handleExportPackage}
							disabled={
								isSaving ||
								isExportingPackage ||
								isImportingPackage ||
								isImportingOgrafPackage
							}
						>
							{isExportingPackage ? (
								<Loader2 className="animate-spin" size={18} />
							) : (
								<Upload size={18} />
							)}
							내보내기
						</Button>
						<input
							ref={packageInputRef}
							type="file"
							accept=".json,.webcgk-rundown.json,application/json,application/vnd.webcgk.rundown+json"
							style={{ display: "none" }}
							onChange={handleImportPackageFile}
						/>
						<Button
							variant="secondary"
							onClick={handleImportPackageClick}
							disabled={
								isSaving ||
								isExportingPackage ||
								isImportingPackage ||
								isImportingOgrafPackage
							}
						>
							{isImportingPackage ? (
								<Loader2 className="animate-spin" size={18} />
							) : (
								<Download size={18} />
							)}
							가져오기
						</Button>
						<input
							ref={ografPackageInputRef}
							type="file"
							accept=".json,.ograf.json,.mjs,application/json,text/javascript"
							multiple
							style={{ display: "none" }}
							onChange={handleImportOgrafPackageFiles}
						/>
						<Button
							variant="secondary"
							onClick={handleImportOgrafPackageClick}
							disabled={
								isSaving ||
								isExportingPackage ||
								isImportingPackage ||
								isImportingOgrafPackage
							}
						>
							{isImportingOgrafPackage ? (
								<Loader2 className="animate-spin" size={18} />
							) : (
								<Upload size={18} />
							)}
							OGraf 가져오기
						</Button>
						<div className="header-divider" />
						<Button
							onClick={handleCreateSession}
							disabled={
								isCreatingSession ||
								isImportingPackage ||
								isImportingOgrafPackage ||
								items.length === 0
							}
						>
							{isCreatingSession ? (
								<Loader2 className="animate-spin" size={18} />
							) : (
								<FolderPlus size={18} />
							)}
							프로젝트 생성
						</Button>
					</div>
				</header>

				{/* 3컬럼 레이아웃 조립 */}
				<div className="rundown-editor-body">
					{/* 1. 왼쪽: 라이브러리 패널 */}
					<LibraryPanel />

					{/* 2. 중앙: 런다운 DND 목록 패널 */}
					<RundownListPanel />

					{/* 3. 오른쪽: 미리보기 및 속성 통합 리사이즈 패널 */}
					<aside
						className="preview-panel"
						style={{ width: previewWidth, minWidth: 240, maxWidth: 520 }}
					>
						{/* 리사이저 드래그 핸들 */}
						<button
							type="button"
							aria-label="속성 패널 폭 조절"
							className="resizer-handle"
							style={{
								position: "absolute",
								left: 0,
								top: 0,
								bottom: 0,
								width: "8px",
								cursor: "ew-resize",
								background: isResizing
									? "var(--accent-primary)"
									: "var(--border-subtle)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								transition: "background 0.15s",
								zIndex: 10,
								border: 0,
								padding: 0,
							}}
							onMouseDown={(e) => {
								e.preventDefault();
								setIsResizing(true);
							}}
							onKeyDown={(e) => {
								if (e.key === "ArrowLeft") {
									e.preventDefault();
									setPreviewWidth((width) => Math.max(240, width - 16));
								}
								if (e.key === "ArrowRight") {
									e.preventDefault();
									setPreviewWidth((width) => Math.min(520, width + 16));
								}
							}}
						>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "3px",
									pointerEvents: "none",
								}}
							>
								<div
									style={{
										width: 3,
										height: 3,
										borderRadius: "50%",
										background: "var(--text-tertiary)",
									}}
								/>
								<div
									style={{
										width: 3,
										height: 3,
										borderRadius: "50%",
										background: "var(--text-tertiary)",
									}}
								/>
								<div
									style={{
										width: 3,
										height: 3,
										borderRadius: "50%",
										background: "var(--text-tertiary)",
									}}
								/>
							</div>
						</button>

						{/* 상단: 미리보기 컴포넌트 */}
						<PreviewPanel />

						{/* 하단: 속성 편집 컴포넌트 */}
						<PropertiesPanel />
					</aside>
				</div>

				{/* 애니메이션 미리보기 모달 */}
				{showPreview && (
					// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: backdrop click closes preview modal; keyboard close is handled by route shortcuts.
					<div
						style={{
							position: "fixed",
							inset: 0,
							zIndex: 9999,
							backgroundColor: "rgba(0,0,0,0.85)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexDirection: "column",
						}}
						onClick={() => setShowPreview(false)}
					>
						{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: inner preview surface must stop backdrop clicks. */}
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
								<div
									style={{
										position: "absolute",
										inset: 0,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "#94a3b8",
										fontSize: "14px",
										zIndex: 2,
									}}
								>
									<Loader2
										size={24}
										className="animate-spin"
										style={{ marginRight: 8 }}
									/>
									오버레이 로딩 중...
								</div>
							)}
							{previewCode && (
								<iframe
									ref={previewIframeRef}
									sandbox="allow-scripts"
									srcDoc={buildPreviewSrcdoc(
										previewCode.html,
										previewCode.css,
										previewCode.js,
									)}
									style={{
										width: "1920px",
										height: "1080px",
										border: "none",
										background: "transparent",
										transformOrigin: "top left",
										transform: "scale(0.667)",
										position: "absolute",
										top: 0,
										left: 0,
									}}
									title="Animation Preview"
									onLoad={triggerPreviewShow}
								/>
							)}
							{!previewLoading && !previewCode && (
								<div
									style={{
										position: "absolute",
										inset: 0,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										color: "#94a3b8",
										fontSize: "14px",
									}}
								>
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
										padding: "8px 20px",
										borderRadius: "6px",
										border: "none",
										cursor: "pointer",
										background: "linear-gradient(135deg, #06b6d4, #0ea5e9)",
										color: "white",
										fontSize: "13px",
										fontWeight: 600,
										display: "flex",
										alignItems: "center",
										gap: "6px",
									}}
								>
									<Play size={14} /> 다시 재생
								</button>
							)}
							<button
								type="button"
								onClick={() => setShowPreview(false)}
								style={{
									padding: "8px 20px",
									borderRadius: "6px",
									border: "1px solid rgba(255,255,255,0.15)",
									background: "transparent",
									color: "#94a3b8",
									cursor: "pointer",
									fontSize: "13px",
									fontWeight: 600,
								}}
							>
								닫기
							</button>
						</div>
						{previewItem && (
							<div
								style={{
									marginTop: "8px",
									fontSize: "12px",
									color: "rgba(255,255,255,0.4)",
								}}
							>
								{previewItem.source_name} · {previewItem.duration}s
							</div>
						)}
					</div>
				)}

				{/* 사용법 가이드 모달 */}
				<BroadcastGuideModal
					isOpen={isGuideOpen}
					onClose={() => setIsGuideOpen(false)}
				/>
			</div>
		</RundownEditorProvider>
	);
}
