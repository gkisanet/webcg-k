import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Plus,
	RotateCcw,
	Save,
	Tags,
	Trash2,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	buildSuggestedName,
	NAMING_TOKEN_GROUPS,
	type NamingTokenGroup,
} from "@/lib/naming/namingSuggestion";
import {
	fetchNamingDictionary,
	normalizeTokenList,
	saveNamingDictionary,
} from "@/services/namingDictionaryService";
import type { Workspace } from "./-adminTypes";

interface AdminNamingTabProps {
	workspaces: Workspace[];
	activeWorkspaceId: string | null;
	userId: string | null | undefined;
}

type NamingDraft = Record<string, string>;

export function AdminNamingTab({
	workspaces,
	activeWorkspaceId,
	userId,
}: AdminNamingTabProps) {
	const queryClient = useQueryClient();
	const workspaceSelectId = useId();
	const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
		activeWorkspaceId ?? workspaces[0]?.id ?? "",
	);
	const [activeGroups, setActiveGroups] = useState<NamingTokenGroup[]>(
		() => NAMING_TOKEN_GROUPS,
	);
	const [draft, setDraft] = useState<NamingDraft>(() =>
		toDraft(NAMING_TOKEN_GROUPS),
	);

	useEffect(() => {
		if (!selectedWorkspaceId && workspaces[0]?.id) {
			setSelectedWorkspaceId(activeWorkspaceId ?? workspaces[0].id);
		}
	}, [activeWorkspaceId, selectedWorkspaceId, workspaces]);

	const { data: dictionary, isLoading } = useQuery({
		queryKey: ["admin", "namingDictionary", selectedWorkspaceId],
		queryFn: () => fetchNamingDictionary(selectedWorkspaceId),
		enabled: Boolean(selectedWorkspaceId),
	});

	useEffect(() => {
		if (dictionary?.token_groups) {
			setActiveGroups(dictionary.token_groups);
		} else {
			setActiveGroups(NAMING_TOKEN_GROUPS);
		}
	}, [dictionary]);

	useEffect(() => {
		setDraft((current) => {
			const nextDraft: NamingDraft = {};
			for (const group of activeGroups) {
				nextDraft[group.id] = current[group.id] ?? group.tokens.join("\n");
			}
			return nextDraft;
		});
	}, [activeGroups]);

	const draftGroups = useMemo(
		() => groupsFromDraft(activeGroups, draft),
		[activeGroups, draft],
	);
	const previewName = buildSuggestedName(
		draftGroups
			.map((group) => group.tokens[0])
			.filter((token): token is string => Boolean(token)),
	);
	const totalTokenCount = draftGroups.reduce(
		(sum, group) => sum + group.tokens.length,
		0,
	);

	const saveMutation = useMutation({
		mutationFn: () =>
			saveNamingDictionary({
				workspaceId: selectedWorkspaceId,
				tokenGroups: draftGroups,
				userId: userId ?? null,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["admin", "namingDictionary", selectedWorkspaceId],
			});
			queryClient.invalidateQueries({
				queryKey: ["namingDictionary", selectedWorkspaceId],
			});
		},
	});

	const resetToDefault = () => {
		if (
			confirm(
				"정말로 기본 네이밍 사전 프리셋으로 복원하시겠습니까? 로컬 미저장 데이터가 모두 지워집니다.",
			)
		) {
			setActiveGroups(NAMING_TOKEN_GROUPS);
			setDraft(toDraft(NAMING_TOKEN_GROUPS));
		}
	};

	const handleAddCategory = () => {
		const label = prompt(
			"새로운 네이밍 사전 카테고리 이름을 입력하세요 (예: 프로그램 이름명):",
		);
		if (!label || !label.trim()) return;

		const trimmedLabel = label.trim();
		const id = `custom_${Date.now()}`;
		const description =
			prompt("카테고리에 대한 간단한 설명을 입력하세요 (선택 사항):") || "";

		const newGroup: NamingTokenGroup = {
			id,
			label: trimmedLabel,
			description: description.trim(),
			tokens: [],
		};

		setActiveGroups((current) => [...current, newGroup]);
		setDraft((current) => ({
			...current,
			[id]: "",
		}));
	};

	const handleDeleteCategory = (id: string) => {
		if (
			!confirm(
				"정말로 이 네이밍 사전 카테고리를 삭제하시겠습니까? 소속된 모든 토큰이 함께 삭제됩니다.",
			)
		)
			return;
		setActiveGroups((current) => current.filter((group) => group.id !== id));
		setDraft((current) => {
			const next = { ...current };
			delete next[id];
			return next;
		});
	};

	const handleMoveCategory = (index: number, direction: "up" | "down") => {
		const nextIndex = direction === "up" ? index - 1 : index + 1;
		if (nextIndex < 0 || nextIndex >= activeGroups.length) return;

		setActiveGroups((current) => {
			const next = [...current];
			const temp = next[index];
			next[index] = next[nextIndex];
			next[nextIndex] = temp;
			return next;
		});
	};

	const handleMetaChange = (
		id: string,
		field: "label" | "description",
		value: string,
	) => {
		setActiveGroups((current) =>
			current.map((group) =>
				group.id === id ? { ...group, [field]: value } : group,
			),
		);
	};

	if (workspaces.length === 0) {
		return (
			<div className="naming-admin-empty">
				<BookOpen size={24} />
				<div>
					<h3>워크스페이스가 없습니다</h3>
					<p>네이밍 사전은 워크스페이스 단위로 저장됩니다.</p>
				</div>
			</div>
		);
	}

	return (
		<div className="admin-naming-tab">
			<div className="admin-naming-hero">
				<div className="admin-naming-hero-icon">
					<Tags size={22} />
				</div>
				<div>
					<h2>네이밍 사전</h2>
					<p>
						방송 그래픽 이름 추천에 쓰는 위치, 역할, 콘텐츠 조건, 스타일, 운영
						상태 토큰을 워크스페이스별로 관리합니다.
					</p>
				</div>
			</div>

			<div className="admin-naming-toolbar">
				<div className="input-group">
					<label htmlFor={workspaceSelectId}>워크스페이스</label>
					<select
						id={workspaceSelectId}
						value={selectedWorkspaceId}
						onChange={(event) => setSelectedWorkspaceId(event.target.value)}
					>
						{workspaces.map((workspace) => (
							<option key={workspace.id} value={workspace.id}>
								{workspace.name}
							</option>
						))}
					</select>
				</div>
				<div className="admin-naming-summary">
					<span>{dictionary ? "사용자 정의 사전" : "기본 사전 사용 중"}</span>
					<strong>{totalTokenCount}개 토큰</strong>
				</div>
				<div className="admin-naming-actions">
					<Button
						type="button"
						variant="secondary"
						onClick={handleAddCategory}
						disabled={isLoading || saveMutation.isPending}
					>
						<Plus size={14} />
						그룹 추가
					</Button>
					<Button
						type="button"
						variant="secondary"
						onClick={resetToDefault}
						disabled={isLoading || saveMutation.isPending}
					>
						<RotateCcw size={14} />
						기본값 불러오기
					</Button>
					<Button
						type="button"
						onClick={() => saveMutation.mutate()}
						disabled={
							isLoading || saveMutation.isPending || !selectedWorkspaceId
						}
					>
						<Save size={14} />
						{saveMutation.isPending ? "저장 중..." : "사전 저장"}
					</Button>
				</div>
			</div>

			<div className="admin-naming-preview">
				<span>추천 이름 예시</span>
				<strong>{previewName || "토큰을 입력하세요"}</strong>
			</div>

			<div className="admin-naming-grid">
				{activeGroups.map((group, index) => {
					return (
						<div className="admin-naming-card" key={group.id}>
							<div className="admin-naming-card-header">
								<div className="admin-naming-card-meta">
									<input
										className="admin-naming-input-label"
										type="text"
										value={group.label}
										onChange={(event) =>
											handleMetaChange(group.id, "label", event.target.value)
										}
										placeholder="그룹 이름 입력"
									/>
									<input
										className="admin-naming-input-desc"
										type="text"
										value={group.description}
										onChange={(event) =>
											handleMetaChange(
												group.id,
												"description",
												event.target.value,
											)
										}
										placeholder="그룹 설명 입력"
									/>
								</div>
								<div className="admin-naming-card-controls">
									<button
										type="button"
										className="control-btn"
										disabled={index === 0}
										onClick={() => handleMoveCategory(index, "up")}
										title="왼쪽(위)으로 이동"
									>
										<ChevronLeft size={16} />
									</button>
									<button
										type="button"
										className="control-btn"
										disabled={index === activeGroups.length - 1}
										onClick={() => handleMoveCategory(index, "down")}
										title="오른쪽(아래)으로 이동"
									>
										<ChevronRight size={16} />
									</button>
									<button
										type="button"
										className="control-btn delete"
										onClick={() => handleDeleteCategory(group.id)}
										title="그룹 삭제"
									>
										<Trash2 size={15} />
									</button>
									<span className="token-count-badge">
										{group.tokens.length}개
									</span>
								</div>
							</div>
							<textarea
								value={draft[group.id] ?? ""}
								onChange={(event) => {
									const text = event.target.value;
									setDraft((current) => ({
										...current,
										[group.id]: text,
									}));
								}}
								placeholder="한 줄에 하나씩 입력하거나 쉼표로 구분"
								rows={8}
							/>
							<div className="admin-naming-token-row">
								{group.tokens.slice(0, 8).map((token) => (
									<span key={token}>{token}</span>
								))}
							</div>
						</div>
					);
				})}
			</div>

			{saveMutation.isError && (
				<div className="admin-naming-error">
					저장에 실패했습니다. 워크스페이스 권한과 migration 적용 여부를
					확인하세요.
				</div>
			)}
		</div>
	);
}

function toDraft(groups: NamingTokenGroup[]): NamingDraft {
	return Object.fromEntries(
		groups.map((group) => [group.id, group.tokens.join("\n")]),
	);
}

function groupsFromDraft(
	baseGroups: NamingTokenGroup[],
	draft: NamingDraft,
): NamingTokenGroup[] {
	return baseGroups.map((baseGroup) => {
		const draftText = draft[baseGroup.id] ?? "";
		const rawTokens = draftText.split(/[\n,]+/u).map((token) => token.trim());

		return {
			...baseGroup,
			tokens: normalizeTokenList(rawTokens, []),
		};
	});
}
