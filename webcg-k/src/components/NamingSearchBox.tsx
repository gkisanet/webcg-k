import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { type KeyboardEvent, useDeferredValue, useId, useState, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import {
	applyNamingSuggestion,
	getNamingQualityWarnings,
	getNamingSuggestions,
	type NamingAssetKind,
	type NamingSuggestion,
} from "@/lib/naming/namingSuggestion";
import { fetchEffectiveNamingTokenGroups } from "@/services/namingDictionaryService";

interface NamingSearchBoxProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	assetKind?: NamingAssetKind;
	existingNames?: string[];
	ariaLabel?: string;
	className?: string;
	controlClassName?: string;
	inputClassName?: string;
	clearLabel?: string;
	showLeadingIcon?: boolean;
	suggestionTitle?: string;
	suggestionHint?: string;
	showQualityWarnings?: boolean;
	currentName?: string;
}

export function NamingSearchBox({
	value,
	onChange,
	placeholder = "검색...",
	assetKind = "graphic",
	existingNames = [],
	ariaLabel = "검색어",
	className = "",
	controlClassName = "",
	inputClassName = "",
	clearLabel = "검색어 지우기",
	showLeadingIcon = true,
	suggestionTitle = "네이밍 규칙 추천",
	suggestionHint = "선택하면 `위치-역할-조건-스타일` 순서로 검색어가 완성됩니다.",
	showQualityWarnings,
	currentName = "",
}: NamingSearchBoxProps) {
	const listboxId = useId();
	const { activeWorkspaceId } = useAuth();
	const deferredValue = useDeferredValue(value);
	const [isFocused, setIsFocused] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const { data: tokenGroups } = useQuery({
		queryKey: ["namingDictionary", activeWorkspaceId],
		queryFn: () => fetchEffectiveNamingTokenGroups(activeWorkspaceId),
		staleTime: 5 * 60 * 1000,
	});
	// 🆕 무거운 네이밍 규칙 스캔 연산을 useMemo로 캐싱하여, 그리드 에디터 드래그 등의 동반 리렌더 시 CPU 연산 낭비 100% 차단
	const suggestionGroups = useMemo(() => {
		return getNamingSuggestions({
			input: deferredValue,
			assetKind,
			existingNames,
			tokenGroups,
		});
	}, [deferredValue, assetKind, existingNames, tokenGroups]);

	const flatSuggestions = useMemo(() => {
		return suggestionGroups.flatMap((group) => group.suggestions);
	}, [suggestionGroups]);

	const clampedActiveIndex = Math.min(
		activeIndex,
		Math.max(flatSuggestions.length - 1, 0),
	);
	const activeSuggestion = flatSuggestions[clampedActiveIndex];
	
	// 🆕 백드롭 포커스 및 통합 드롭다운으로 개편함에 따라 isOpen 간소화
	const isOpen = isFocused && flatSuggestions.length > 0;

	const shouldShowQualityWarnings = useMemo(() => {
		return showQualityWarnings ??
			className
				.split(/\s+/u)
				.some((name) =>
					["name-builder", "editor-title", "overlay-title"].includes(name),
				);
	}, [showQualityWarnings, className]);

	// 🆕 무거운 네이밍 품질 경고 체크 연산을 useMemo로 캐싱하여 CPU 누수 원천 제거
	const qualityWarnings = useMemo(() => {
		return shouldShowQualityWarnings
			? getNamingQualityWarnings({
					input: deferredValue,
					assetKind,
					existingNames,
					currentName,
					tokenGroups,
				})
			: [];
	}, [shouldShowQualityWarnings, deferredValue, assetKind, existingNames, currentName, tokenGroups]);

	// 🆕 팝오버 방식 전환으로 isQualityOpen 단순화
	const isQualityOpen =
		shouldShowQualityWarnings &&
		(isFocused || Boolean(value.trim())) &&
		qualityWarnings.length > 0;

	const handlePick = (suggestion: NamingSuggestion) => {
		onChange(applyNamingSuggestion(value, suggestion));
		setActiveIndex(0);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isOpen) return;

		if (event.key === "ArrowDown") {
			event.preventDefault();
			setActiveIndex((current) =>
				Math.min(current + 1, flatSuggestions.length - 1),
			);
		}

		if (event.key === "ArrowUp") {
			event.preventDefault();
			setActiveIndex((current) => Math.max(current - 1, 0));
		}

		if (event.key === "Enter" && activeSuggestion) {
			event.preventDefault();
			handlePick(activeSuggestion);
		}

		if (event.key === "Escape") {
			event.preventDefault();
			setIsFocused(false);
		}
	};

	const hasWarnings = qualityWarnings.length > 0;

	return (
		<>
			{/* 🆕 입력 박스 활성화 시 전체 화면을 덮어 몰입감을 주는 반투명 어두운 blur 백드롭 */}
			{isFocused && (
				<div
					className="naming-search-backdrop"
					onClick={() => setIsFocused(false)}
					onMouseDown={(event) => event.preventDefault()}
				/>
			)}

			<div
				className={`naming-search${className ? ` ${className}` : ""}${
					isFocused ? " active-focused" : ""
				}`}
			>
				<div
					className={`graphics-filter-search naming-search-control${
						controlClassName ? ` ${controlClassName}` : ""
					}${hasWarnings ? " has-warnings" : ""}`}
				>
					{showLeadingIcon && (
						<Search size={14} className="graphics-filter-icon" />
					)}
					<input
						aria-activedescendant={
							isOpen && activeSuggestion
								? `${listboxId}-${clampedActiveIndex}`
								: undefined
						}
						aria-autocomplete="list"
						aria-controls={isOpen ? listboxId : undefined}
						aria-expanded={isOpen}
						aria-label={ariaLabel}
						className={`graphics-filter-input${inputClassName ? ` ${inputClassName}` : ""}`}
						type="text"
						placeholder={placeholder}
						value={value}
						onChange={(event) => {
							onChange(event.target.value);
							setActiveIndex(0);
						}}
						onBlur={() => setIsFocused(false)}
						onFocus={() => {
							setIsFocused(true);
							setActiveIndex(0);
						}}
						onKeyDown={handleKeyDown}
						role="combobox"
					/>
					{value && (
						<button
							type="button"
							className="graphics-filter-clear"
							aria-label={clearLabel}
							onClick={() => {
								onChange("");
								setActiveIndex(0);
							}}
						>
							<X size={12} />
						</button>
					)}
				</div>

				{/* 🆕 품질 경고 피드백과 규칙 추천 칩 리스트를 단일 absolute Popover 카드 내부로 완벽 조립 통합 */}
				{isFocused && (hasWarnings || flatSuggestions.length > 0) && (
					<div className="naming-search-dropdown" id={listboxId} role="listbox">
						{/* 1. 네이밍 품질 경고 피드백 섹션 */}
						{hasWarnings && (
							<div className="naming-quality-warnings-section">
								<div className="naming-dropdown-section-title warning">
									네이밍 품질 피드백
								</div>
								<div className="naming-quality-warnings" aria-live="polite">
									{qualityWarnings.map((warning) => (
										<div
											className={`naming-quality-warning ${warning.severity}`}
											key={warning.code}
										>
											<span className="naming-quality-dot" />
											<span>{warning.message}</span>
										</div>
									))}
								</div>
							</div>
						)}

						{/* 2. 네이밍 규칙 추천 칩 섹션 */}
						{flatSuggestions.length > 0 && (
							<div className="naming-suggestions-section">
								<div className="naming-dropdown-section-title suggestion">
									{suggestionTitle}
								</div>
								{suggestionGroups.map((group) => (
									<div className="naming-suggestion-group" key={group.id}>
										<div className="naming-suggestion-group-label">
											<span>{group.label}</span>
											{group.description && <small>{group.description}</small>}
										</div>
										<div className="naming-suggestion-list">
											{group.suggestions.map((suggestion) => {
												const optionIndex = flatSuggestions.findIndex(
													(item) => item.id === suggestion.id,
												);
												const isActive = optionIndex === clampedActiveIndex;
												return (
													<button
														type="button"
														className={`naming-suggestion-chip${
															isActive ? " active" : ""
														}`}
														id={`${listboxId}-${optionIndex}`}
														key={suggestion.id}
														onClick={() => handlePick(suggestion)}
														onMouseDown={(event) => event.preventDefault()}
														role="option"
														aria-selected={isActive}
													>
														{suggestion.label}
													</button>
												);
											})}
										</div>
									</div>
								))}
								<div className="naming-suggestions-hint">{suggestionHint}</div>
							</div>
						)}
					</div>
				)}
			</div>
		</>
	);
}
