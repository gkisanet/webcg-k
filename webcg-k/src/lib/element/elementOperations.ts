import type { GraphicElement } from "@/routes/dashboard/studio/graphics/$graphicId";

export function updateElement(
	elements: GraphicElement[],
	id: string,
	updates: Partial<GraphicElement>,
): GraphicElement[] {
	const element = elements.find((el) => el.id === id);
	if (!element) return elements;

	if (
		(element.type === "group" || element.type === "boolean_group") &&
		element.children &&
		(updates.x !== undefined || updates.y !== undefined)
	) {
		const dx = updates.x !== undefined ? updates.x - element.x : 0;
		const dy = updates.y !== undefined ? updates.y - element.y : 0;
		return elements.map((el) => {
			if (el.id === id) return { ...el, ...updates };
			if (element.children?.includes(el.id)) {
				return { ...el, x: el.x + dx, y: el.y + dy };
			}
			return el;
		});
	}

	return elements.map((el) => (el.id === id ? { ...el, ...updates } : el));
}

export function deleteElements(
	elements: GraphicElement[],
	ids: string[],
): GraphicElement[] {
	const groupsToDelete = elements.filter(
		(el) =>
			ids.includes(el.id) &&
			(el.type === "group" || el.type === "boolean_group"),
	);
	const childIdsToFree = new Set<string>();
	for (const group of groupsToDelete) {
		for (const childId of group.children ?? []) {
			childIdsToFree.add(childId);
		}
	}
	return elements
		.filter((el) => !ids.includes(el.id))
		.map((el) => (childIdsToFree.has(el.id) ? { ...el, parentId: null } : el));
}

export function releaseCompositionMask(
	elements: GraphicElement[],
	ids: string[],
): GraphicElement[] {
	const idSet = new Set(ids);
	let changed = false;

	const nextElements = elements.map((element) => {
		if (!idSet.has(element.id) || !element.maskSourceId) return element;
		changed = true;
		return {
			...element,
			maskSourceId: null,
			maskMode: undefined,
		};
	});

	return changed ? nextElements : elements;
}

export function releaseBooleanGroups(
	elements: GraphicElement[],
	ids: string[],
): { elements: GraphicElement[]; releasedChildIds: string[] } {
	const idSet = new Set(ids);
	const groupsToRelease = elements.filter(
		(element) => idSet.has(element.id) && element.type === "boolean_group",
	);

	if (groupsToRelease.length === 0) {
		return { elements, releasedChildIds: [] };
	}

	const releaseMap = new Map(groupsToRelease.map((group) => [group.id, group]));
	const childToParent = new Map<string, string | null>();
	const releasedChildIds: string[] = [];

	for (const group of groupsToRelease) {
		for (const childId of group.children ?? []) {
			childToParent.set(childId, group.parentId ?? null);
			releasedChildIds.push(childId);
		}
	}

	const nextElements = elements
		.filter((element) => !releaseMap.has(element.id))
		.map((element) => {
			const releasedParentId = childToParent.get(element.id);
			if (childToParent.has(element.id)) {
				return {
					...element,
					parentId: releasedParentId ?? null,
				};
			}

			if (
				(element.type === "group" || element.type === "boolean_group") &&
				element.children
			) {
				const nextChildren = element.children.flatMap(
					(childId) => releaseMap.get(childId)?.children ?? [childId],
				);
				const childrenChanged =
					nextChildren.length !== element.children.length ||
					nextChildren.some(
						(childId, index) => childId !== element.children?.[index],
					);

				if (childrenChanged) {
					return {
						...element,
						children: nextChildren,
					};
				}
			}

			return element;
		});

	return { elements: nextElements, releasedChildIds };
}

export type AlignmentType =
	| "top"
	| "middle"
	| "bottom"
	| "left"
	| "center"
	| "right";

export function alignElements(
	elements: GraphicElement[],
	selectedIds: string[],
	alignment: AlignmentType,
	canvasWidth: number,
	canvasHeight: number,
): GraphicElement[] {
	if (selectedIds.length === 0) return elements;
	const selectedElems = elements.filter((el) => selectedIds.includes(el.id));

	let minX: number, minY: number, maxX: number, maxY: number;
	if (selectedElems.length === 1) {
		minX = 0;
		minY = 0;
		maxX = canvasWidth;
		maxY = canvasHeight;
	} else {
		minX = Math.min(...selectedElems.map((el) => el.x));
		minY = Math.min(...selectedElems.map((el) => el.y));
		maxX = Math.max(...selectedElems.map((el) => el.x + el.width));
		maxY = Math.max(...selectedElems.map((el) => el.y + el.height));
	}

	return elements.map((el) => {
		if (!selectedIds.includes(el.id)) return el;
		let { x, y } = el;
		switch (alignment) {
			case "top":
				y = minY;
				break;
			case "middle":
				y = minY + (maxY - minY) / 2 - el.height / 2;
				break;
			case "bottom":
				y = maxY - el.height;
				break;
			case "left":
				x = minX;
				break;
			case "center":
				x = minX + (maxX - minX) / 2 - el.width / 2;
				break;
			case "right":
				x = maxX - el.width;
				break;
		}
		return { ...el, x, y };
	});
}
