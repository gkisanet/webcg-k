export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";

interface VectorElementGeometry {
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius?: number;
}

interface BoundedElement {
	x: number;
	y: number;
	width: number;
	height: number;
}

const round = (value: number) => Number(value.toFixed(3));

export function isBooleanOperand(element: { type: string }): boolean {
	return element.type === "rect" || element.type === "ellipse" || element.type === "text";
}

export function isMaskSource(element: { type: string }): boolean {
	return (
		element.type === "rect" ||
		element.type === "ellipse" ||
		element.type === "text"
	);
}

export function canMaskTarget(element: { type: string }): boolean {
	return element.type !== "html_plugin" && element.type !== "boolean_group";
}

export function getElementsBounds(
	elements: BoundedElement[],
): BoundedElement | null {
	if (elements.length === 0) return null;
	const minX = Math.min(...elements.map((el) => el.x));
	const minY = Math.min(...elements.map((el) => el.y));
	const maxX = Math.max(...elements.map((el) => el.x + el.width));
	const maxY = Math.max(...elements.map((el) => el.y + el.height));
	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

export function elementToPathD(element: VectorElementGeometry): string | null {
	if (element.width <= 0 || element.height <= 0) return null;

	if (element.type === "ellipse") {
		const rx = round(element.width / 2);
		const ry = round(element.height / 2);
		const cx = round(element.x + element.width / 2);
		const cy = round(element.y + element.height / 2);
		return [
			`M ${round(cx - rx)} ${cy}`,
			`A ${rx} ${ry} 0 1 0 ${round(cx + rx)} ${cy}`,
			`A ${rx} ${ry} 0 1 0 ${round(cx - rx)} ${cy}`,
			"Z",
		].join(" ");
	}

	if (element.type === "rect") {
		const x = round(element.x);
		const y = round(element.y);
		const right = round(element.x + element.width);
		const bottom = round(element.y + element.height);
		const radius = Math.min(
			element.borderRadius ?? 0,
			element.width / 2,
			element.height / 2,
		);

		if (radius <= 0) {
			return `M ${x} ${y} H ${right} V ${bottom} H ${x} Z`;
		}

		const r = round(radius);
		return [
			`M ${round(x + r)} ${y}`,
			`H ${round(right - r)}`,
			`Q ${right} ${y} ${right} ${round(y + r)}`,
			`V ${round(bottom - r)}`,
			`Q ${right} ${bottom} ${round(right - r)} ${bottom}`,
			`H ${round(x + r)}`,
			`Q ${x} ${bottom} ${x} ${round(bottom - r)}`,
			`V ${round(y + r)}`,
			`Q ${x} ${y} ${round(x + r)} ${y}`,
			"Z",
		].join(" ");
	}

	return null;
}
