import { createContext, useContext, type ReactNode } from "react";
import type { DndContextProps } from "@dnd-kit/core";
import type { GraphicElement } from "../GraphicPreviewRenderer";

/**
 * 탭 타입 정의
 */
export type LibraryTab = "graphics" | "sections";
export type SectionImportScope = "all" | "workspace" | "public";

export interface RundownMeta {
	id: string;
	title: string;
	description?: string | null;
	workspace_id?: string | null;
	created_by?: string | null;
}

export interface RundownItem {
	id: string;
	rundown_id: string;
	source_type: "graphic" | "template" | "overlay";
	source_id: string;
	source_name: string;
	data: any;
	item_order: number;
	duration: number;
	thumbnail?: string | null;
	section_id?: string | null;
	parent_item_id?: string | null;
	track_layer?: "wrap" | null;
}

export interface LibraryItem {
	id: string;
	name: string;
	source_type: "graphic" | "template" | "overlay";
	thumbnail?: string | null;
	data: any;
}

export interface RundownSection {
	id: string;
	label: string;
	order: number;
	color: string;
}

export interface RundownSectionImportCandidate {
	source_rundown_id: string;
	source_rundown_title: string;
	source_is_public: boolean;
	item_count: number;
	section: RundownSection;
}

/**
 * ⚡ 방송 그래픽(Broadcast Graphics) 런다운 상태 컨텍스트 명세 (State Channel)
 * 자주 갱신되는 동적 상태 정보만 관리하여 리렌더 범위를 차단막 내부로 제한합니다.
 */
export interface RundownEditorState {
	rundownId: string;
	loading: boolean;
	rundown: RundownMeta | null;
	items: RundownItem[];
	selectedItemId: string | null;
	isSaving: boolean;
	isCreatingSession: boolean;
	isExportingPackage: boolean;
	isImportingPackage: boolean;
	activeTab: LibraryTab;
	libraryItems: LibraryItem[];
	libraryLoading: boolean;
	sectionImportCandidates: RundownSectionImportCandidate[];
	sectionImportSearch: string;
	sectionImportScope: SectionImportScope;
	importingSectionKey: string | null;
	previewWidth: number;
	isResizing: boolean;
	copiedItem: RundownItem | null;
	sections: RundownSection[];
	collapsedSections: Set<string>;
	activeSectionId: string | null;
	showPreview: boolean;
	previewItem: RundownItem | null;
	previewCode: { html: string; css: string; js: string } | null;
	isGuideOpen: boolean;
	previewLoading: boolean;
	
	// 파생 상태
	selectedItem: RundownItem | undefined;
	selectedOverlaySchemaEntries: [string, any][];
	selectedOverlayData: Record<string, any>;
	selectedGraphicElements: GraphicElement[];
	selectedEditableTextElements: any[];
}

/**
 * ⚡ 방송 그래픽(Broadcast Graphics) 런다운 액션 컨텍스트 명세 (Action Channel)
 * 생명주기 동안 절대 주소가 바뀌지 않는 불변의 비즈니스 핸들러 및 세터만 공급하여 리렌더링을 가드합니다.
 */
export interface RundownEditorActions {
	setRundown: (val: RundownMeta | null | ((prev: RundownMeta | null) => RundownMeta | null)) => void;
	setItems: (val: RundownItem[] | ((prev: RundownItem[]) => RundownItem[])) => void;
	setSelectedItemId: (val: string | null | ((prev: string | null) => string | null)) => void;
	setActiveTab: (val: LibraryTab | ((prev: LibraryTab) => LibraryTab)) => void;
	setSectionImportSearch: (val: string | ((prev: string) => string)) => void;
	setSectionImportScope: (val: SectionImportScope | ((prev: SectionImportScope) => SectionImportScope)) => void;
	setPreviewWidth: (val: number | ((prev: number) => number)) => void;
	setIsResizing: (val: boolean | ((prev: boolean) => boolean)) => void;
	setCollapsedSections: (val: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
	setActiveSectionId: (val: string | null | ((prev: string | null) => string | null)) => void;
	setShowPreview: (val: boolean | ((prev: boolean) => boolean)) => void;
	setIsGuideOpen: (val: boolean | ((prev: boolean) => boolean)) => void;
	
	// 비즈니스 액션
	handleAddSection: () => void;
	handleDeleteSection: (sectionId: string) => void;
	handleRenameSection: (sectionId: string, newLabel: string) => void;
	toggleSectionCollapse: (sectionId: string) => void;
	handleToggleWrap: (itemId: string) => void;
	handleSetParent: (childId: string, parentId: string | null) => void;
	handleDeleteItemWithOrphanRecovery: (id: string) => Promise<void>;
	handleAddToRundown: (item: LibraryItem) => Promise<void>;
	handleImportSection: (candidate: RundownSectionImportCandidate) => Promise<void>;
	handlePlayItem: (item: RundownItem) => Promise<void>;
	triggerPreviewShow: () => void;
	updateSelectedGraphicElements: (updater: (elements: GraphicElement[]) => GraphicElement[]) => void;
	
	// DnD & 패키지 액션
	sensors: any;
	handleDragEnd: DndContextProps["onDragEnd"];
	handleSave: () => Promise<void>;
	handleExportPackage: () => Promise<void>;
	handleImportPackageClick: () => void;
	handleImportPackageFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
	handleCreateSession: () => Promise<void>;
	
	// Refs
	packageInputRef: React.RefObject<HTMLInputElement | null>;
	previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
}

const RundownStateContext = createContext<RundownEditorState | null>(null);
const RundownActionContext = createContext<RundownEditorActions | null>(null);

interface RundownEditorProviderProps {
	state: RundownEditorState;
	actions: RundownEditorActions;
	children: ReactNode;
}

/**
 * Dual-Context Provider 컴포넌트
 */
export function RundownEditorProvider({
	state,
	actions,
	children,
}: RundownEditorProviderProps) {
	return (
		<RundownStateContext.Provider value={state}>
			<RundownActionContext.Provider value={actions}>
				{children}
			</RundownActionContext.Provider>
		</RundownStateContext.Provider>
	);
}

/**
 * ⚡ 동적 상태 조회 훅
 */
export function useRundownState(): RundownEditorState {
	const context = useContext(RundownStateContext);
	if (!context) {
		throw new Error("useRundownState must be used within a RundownEditorProvider");
	}
	return context;
}

/**
 * ⚡ 불변 액션(핸들러) 조회 훅 (리렌더 무반응 보장)
 */
export function useRundownActions(): RundownEditorActions {
	const context = useContext(RundownActionContext);
	if (!context) {
		throw new Error("useRundownActions must be used within a RundownEditorProvider");
	}
	return context;
}
