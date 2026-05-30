export type NamingAssetKind =
	| "graphic"
	| "overlay"
	| "grid_template"
	| "bundle";

export type NamingTokenGroupId = string;

export interface NamingTokenGroup {
	id: NamingTokenGroupId;
	label: string;
	description: string;
	tokens: string[];
}

export interface ParsedNamingToken {
	raw: string;
	normalized: string;
}

export interface NamingSuggestion {
	id: string;
	label: string;
	value: string;
	groupId?: NamingTokenGroupId;
	source: "taxonomy" | "existing-name";
}

export interface NamingSuggestionGroup {
	id: string;
	label: string;
	description?: string;
	suggestions: NamingSuggestion[];
}

export interface NamedAssetCandidate {
	name?: string | null;
	description?: string | null;
	_type?: string | null;
	tokens?: string[];
}

export type NamingQualityWarningCode =
	| "empty"
	| "temporary_name"
	| "missing_position"
	| "missing_role"
	| "duplicate_name";

export interface NamingQualityWarning {
	code: NamingQualityWarningCode;
	severity: "info" | "warning";
	message: string;
}

export const NAMING_TOKEN_GROUPS: NamingTokenGroup[] = [
	{
		id: "position",
		label: "위치",
		description: "화면에서 그래픽이 놓이는 기준 위치",
		tokens: [
			"좌상단",
			"우상단",
			"좌하단",
			"우하단",
			"상단",
			"하단",
			"중앙",
			"전체화면",
		],
	},
	{
		id: "role",
		label: "역할",
		description: "방송 그래픽이 수행하는 정보 전달 역할",
		tokens: [
			"헤드라인",
			"하단자막",
			"인물슈퍼",
			"출처",
			"속보",
			"알림",
			"스코어",
			"순위",
			"로고",
		],
	},
	{
		id: "content",
		label: "콘텐츠 조건",
		description: "텍스트 길이와 들어갈 데이터 형태",
		tokens: [
			"두글자",
			"세글자",
			"긴문장",
			"숫자",
			"이름직함",
			"사진",
			"날짜",
			"시간",
		],
	},
	{
		id: "style",
		label: "스타일",
		description: "색상, 겹침, 강조 방식",
		tokens: [
			"빨강",
			"파랑",
			"검정",
			"흰색",
			"투명",
			"강조",
			"겹침",
			"박스",
			"라인",
		],
	},
	{
		id: "state",
		label: "운영 상태",
		description: "제작/승인/송출 재사용 상태",
		tokens: ["AI초안", "검수필요", "승인", "방송용", "템플릿", "재사용"],
	},
];

const NAMING_DELIMITER_PATTERN = /[-_\s/|,·]+/u;
const TRAILING_DELIMITER_PATTERN = /[-_\s/|,·]$/u;
const TOKEN_JOINER = "-";

const TAXONOMY_TOKEN_TO_GROUP = new Map<string, NamingTokenGroupId>(
	NAMING_TOKEN_GROUPS.flatMap((group) =>
		group.tokens.map(
			(token) => [normalizeNamingText(token), group.id] as const,
		),
	),
);

export function normalizeNamingText(value: string): string {
	return value
		.trim()
		.toLocaleLowerCase("ko-KR")
		.replace(/[()［\][\]{}"'“”‘’]/gu, "")
		.replace(/\s+/gu, " ");
}

const TEMPORARY_NAME_VALUES = new Set(
	[
		"새 그래픽",
		"새 오버레이",
		"새 그리드 템플릿",
		"새 플러그인",
		"untitled",
		"new",
		"test",
		"테스트",
		"temp",
		"tmp",
		"임시",
		"final",
		"최종",
		"복사본",
	].map(normalizeNamingText),
);

const TEMPORARY_NAME_PATTERNS = [
	/^final[-_\s]?\d*$/u,
	/^test[-_\s]?\d*$/u,
	/^temp[-_\s]?\d*$/u,
	/^tmp[-_\s]?\d*$/u,
	/^copy[-_\s]?\d*$/u,
	/^new[-_\s]?\d*$/u,
	/^v\d+$/u,
];

export function parseNamingQuery(input: string): ParsedNamingToken[] {
	return normalizeNamingText(input)
		.split(NAMING_DELIMITER_PATTERN)
		.map((token) => token.trim())
		.filter(Boolean)
		.map((token) => ({
			raw: token,
			normalized: normalizeNamingText(token),
		}));
}

export function buildSuggestedName(tokens: string[]): string {
	return tokens
		.map((token) => token.trim())
		.filter(Boolean)
		.join(TOKEN_JOINER);
}

export function applyNamingSuggestion(
	input: string,
	suggestion: NamingSuggestion,
): string {
	if (suggestion.source === "existing-name") {
		return suggestion.value;
	}

	const currentTokens = parseNamingQuery(input).map((token) => token.raw);
	const suggestionValue = suggestion.value.trim();
	if (!suggestionValue) return buildSuggestedName(currentTokens);

	const normalizedSuggestion = normalizeNamingText(suggestionValue);
	const hasSuggestion = currentTokens.some(
		(token) => normalizeNamingText(token) === normalizedSuggestion,
	);

	if (hasSuggestion) {
		return buildSuggestedName(currentTokens);
	}

	if (input.trim() && !TRAILING_DELIMITER_PATTERN.test(input)) {
		const inputTokens = parseNamingQuery(input);
		const trailingToken = inputTokens.at(-1);
		const trailingIsTaxonomyToken = trailingToken
			? TAXONOMY_TOKEN_TO_GROUP.has(trailingToken.normalized)
			: false;
		const suggestionMatchesTrailing = trailingToken
			? normalizedSuggestion.startsWith(trailingToken.normalized)
			: false;

		if (
			trailingToken &&
			!trailingIsTaxonomyToken &&
			suggestionMatchesTrailing
		) {
			return buildSuggestedName([
				...currentTokens.slice(0, -1),
				suggestionValue,
			]);
		}
	}

	return buildSuggestedName([...currentTokens, suggestionValue]);
}

export function scoreNamedAsset(
	asset: NamedAssetCandidate,
	query: string,
): number {
	const queryTokens = parseNamingQuery(query);
	if (queryTokens.length === 0) return 0;

	const name = normalizeNamingText(asset.name ?? "");
	const description = normalizeNamingText(asset.description ?? "");
	const type = normalizeNamingText(asset._type ?? "");
	const explicitTokens = (asset.tokens ?? []).map(normalizeNamingText);
	const nameTokens = parseNamingQuery(asset.name ?? "").map(
		(token) => token.normalized,
	);
	const searchableText = [name, description, type, ...explicitTokens]
		.filter(Boolean)
		.join(" ");
	const normalizedQuery = queryTokens
		.map((token) => token.normalized)
		.join(" ");

	let score = 0;
	for (const token of queryTokens) {
		const value = token.normalized;
		if (!value) continue;

		if (name === value) {
			score += 80;
			continue;
		}

		if (nameTokens.includes(value) || explicitTokens.includes(value)) {
			score += 50;
			continue;
		}

		if (
			nameTokens.some((candidate) => candidate.startsWith(value)) ||
			explicitTokens.some((candidate) => candidate.startsWith(value))
		) {
			score += 35;
			continue;
		}

		if (searchableText.includes(value)) {
			score += 20;
			continue;
		}

		return 0;
	}

	if (name.startsWith(normalizedQuery)) score += 30;
	if (name.includes(normalizedQuery)) score += 15;

	return score;
}

export function assetMatchesNamingQuery(
	asset: NamedAssetCandidate,
	query: string,
): boolean {
	return (
		parseNamingQuery(query).length === 0 || scoreNamedAsset(asset, query) > 0
	);
}

export function getNamingQualityWarnings({
	input,
	assetKind = "graphic",
	existingNames = [],
	currentName = "",
	tokenGroups = NAMING_TOKEN_GROUPS,
}: {
	input: string;
	assetKind?: NamingAssetKind;
	existingNames?: string[];
	currentName?: string;
	tokenGroups?: NamingTokenGroup[];
}): NamingQualityWarning[] {
	const normalizedInput = normalizeNamingText(input);
	if (!normalizedInput) {
		return [
			{
				code: "empty",
				severity: "info",
				message: "이름을 입력하면 네이밍 품질을 점검합니다.",
			},
		];
	}

	const warnings: NamingQualityWarning[] = [];
	const normalizedCurrentName = normalizeNamingText(currentName);
	const hasDuplicateName = existingNames.some((name) => {
		const normalizedName = normalizeNamingText(name);
		return (
			normalizedName &&
			normalizedName === normalizedInput &&
			normalizedName !== normalizedCurrentName
		);
	});

	if (hasDuplicateName) {
		warnings.push({
			code: "duplicate_name",
			severity: "warning",
			message:
				"같은 이름이 이미 있습니다. 검색과 운영 구분이 어려워질 수 있습니다.",
		});
	}

	if (isTemporaryNamingText(normalizedInput)) {
		warnings.push({
			code: "temporary_name",
			severity: "warning",
			message: "임시 이름입니다. 위치와 역할이 드러나는 이름으로 바꾸세요.",
		});
	}

	const filledGroups = getFilledNamingGroups(input, tokenGroups);
	const hasPositionGroup = tokenGroups.some((group) => group.id === "position");
	if (
		hasPositionGroup &&
		assetKind !== "bundle" &&
		!filledGroups.has("position")
	) {
		const examples = getTokenExamples(tokenGroups, "position", [
			"좌상단",
			"하단",
			"중앙",
		]);
		warnings.push({
			code: "missing_position",
			severity: "warning",
			message: `위치 토큰이 없습니다. 예: ${examples.join(", ")}`,
		});
	}

	const hasRoleGroup = tokenGroups.some((group) => group.id === "role");
	if (hasRoleGroup && !filledGroups.has("role")) {
		const examples = getTokenExamples(tokenGroups, "role", [
			"헤드라인",
			"출처",
			"하단자막",
		]);
		warnings.push({
			code: "missing_role",
			severity: "warning",
			message: `역할 토큰이 없습니다. 예: ${examples.join(", ")}`,
		});
	}

	return warnings;
}

export function getNamingSuggestions({
	input,
	assetKind = "graphic",
	existingNames = [],
	limit = 7,
	tokenGroups = NAMING_TOKEN_GROUPS,
}: {
	input: string;
	assetKind?: NamingAssetKind;
	existingNames?: string[];
	limit?: number;
	tokenGroups?: NamingTokenGroup[];
}): NamingSuggestionGroup[] {
	const parsedTokens = parseNamingQuery(input);
	const selectedTokenSet = new Set(
		parsedTokens.map((token) => token.normalized),
	);
	const tokenToGroup = buildTokenGroupMap(tokenGroups);
	const filledGroups = getFilledNamingGroups(input, tokenGroups);

	const trailingToken = parsedTokens.at(-1)?.normalized ?? "";
	const hasTrailingDelimiter =
		input === "" || TRAILING_DELIMITER_PATTERN.test(input);
	const trailingIsTaxonomyToken = tokenToGroup.has(trailingToken);
	const shouldFilterByTrailing = Boolean(
		trailingToken && !hasTrailingDelimiter && !trailingIsTaxonomyToken,
	);

	const taxonomyGroups = shouldFilterByTrailing
		? buildMatchingTaxonomyGroups(
				trailingToken,
				selectedTokenSet,
				limit,
				tokenGroups,
			)
		: buildNextTaxonomyGroup(
				filledGroups,
				selectedTokenSet,
				limit,
				tokenGroups,
			);

	const existingNameGroup = buildExistingNameGroup(
		input,
		existingNames,
		assetKind,
		limit,
	);
	return [...taxonomyGroups, ...existingNameGroup];
}

function buildNextTaxonomyGroup(
	filledGroups: Set<NamingTokenGroupId>,
	selectedTokenSet: Set<string>,
	limit: number,
	tokenGroups: NamingTokenGroup[],
): NamingSuggestionGroup[] {
	const nextGroup = tokenGroups.find((group) => !filledGroups.has(group.id));
	if (!nextGroup) return [];

	return [
		{
			id: nextGroup.id,
			label: `${nextGroup.label} 추천`,
			description: nextGroup.description,
			suggestions: nextGroup.tokens
				.filter((token) => !selectedTokenSet.has(normalizeNamingText(token)))
				.slice(0, limit)
				.map((token) => ({
					id: `${nextGroup.id}:${token}`,
					label: token,
					value: token,
					groupId: nextGroup.id,
					source: "taxonomy" as const,
				})),
		},
	].filter((group) => group.suggestions.length > 0);
}

function buildMatchingTaxonomyGroups(
	trailingToken: string,
	selectedTokenSet: Set<string>,
	limit: number,
	tokenGroups: NamingTokenGroup[],
): NamingSuggestionGroup[] {
	const suggestions = tokenGroups
		.flatMap((group) =>
			group.tokens
				.filter((token) => {
					const normalizedToken = normalizeNamingText(token);
					return (
						!selectedTokenSet.has(normalizedToken) &&
						(normalizedToken.startsWith(trailingToken) ||
							normalizedToken.includes(trailingToken))
					);
				})
				.map((token) => ({
					id: `${group.id}:${token}`,
					label: token,
					value: token,
					groupId: group.id,
					source: "taxonomy" as const,
				})),
		)
		.slice(0, limit);

	if (suggestions.length === 0) return [];

	return [
		{
			id: "matching-taxonomy",
			label: "추천 토큰",
			description: "입력 중인 단어와 맞는 네이밍 규칙",
			suggestions,
		},
	];
}

function buildExistingNameGroup(
	input: string,
	existingNames: string[],
	assetKind: NamingAssetKind,
	limit: number,
): NamingSuggestionGroup[] {
	if (parseNamingQuery(input).length === 0) return [];

	const suggestions = existingNames
		.map((name) => ({
			name,
			score: scoreNamedAsset({ name }, input),
		}))
		.filter((candidate) => candidate.score > 0)
		.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ko-KR"))
		.slice(0, limit)
		.map((candidate) => ({
			id: `existing-name:${candidate.name}`,
			label: candidate.name,
			value: candidate.name,
			source: "existing-name" as const,
		}));

	if (suggestions.length === 0) return [];

	return [
		{
			id: "existing-names",
			label: `기존 ${getAssetKindLabel(assetKind)} 이름`,
			description: "현재 라이브러리에 있는 유사 이름",
			suggestions,
		},
	];
}

function getFilledNamingGroups(
	input: string,
	tokenGroups: NamingTokenGroup[],
): Set<NamingTokenGroupId> {
	const filledGroups = new Set<NamingTokenGroupId>();
	const tokenToGroup = buildTokenGroupMap(tokenGroups);
	for (const token of parseNamingQuery(input)) {
		const groupId = tokenToGroup.get(token.normalized);
		if (groupId) filledGroups.add(groupId);
	}
	return filledGroups;
}

function buildTokenGroupMap(
	tokenGroups: NamingTokenGroup[],
): Map<string, NamingTokenGroupId> {
	return new Map<string, NamingTokenGroupId>(
		tokenGroups.flatMap((group) =>
			group.tokens.map(
				(token) => [normalizeNamingText(token), group.id] as const,
			),
		),
	);
}

function getTokenExamples(
	tokenGroups: NamingTokenGroup[],
	groupId: NamingTokenGroupId,
	fallback: string[],
): string[] {
	const group = tokenGroups.find((candidate) => candidate.id === groupId);
	const examples = group?.tokens.filter(Boolean).slice(0, 3);
	return examples && examples.length > 0 ? examples : fallback;
}

function isTemporaryNamingText(normalizedInput: string): boolean {
	if (TEMPORARY_NAME_VALUES.has(normalizedInput)) return true;
	if (
		TEMPORARY_NAME_PATTERNS.some((pattern) => pattern.test(normalizedInput))
	) {
		return true;
	}

	return parseNamingQuery(normalizedInput).some((token) =>
		TEMPORARY_NAME_VALUES.has(token.normalized),
	);
}

function getAssetKindLabel(assetKind: NamingAssetKind): string {
	if (assetKind === "overlay") return "오버레이";
	if (assetKind === "grid_template") return "그리드";
	if (assetKind === "bundle") return "번들";
	return "그래픽";
}
