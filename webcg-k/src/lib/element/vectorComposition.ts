export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";

interface VectorElementGeometry {
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	borderRadius?: number;
	borderRadiusUnit?: "px" | "%";
	borderRadiusTL?: number;
	borderRadiusTR?: number;
	borderRadiusBR?: number;
	borderRadiusBL?: number;
	borderRadiusLinked?: boolean;
}

interface BoundedElement {
	x: number;
	y: number;
	width: number;
	height: number;
}

const round = (value: number) => Number(value.toFixed(3));

export function isBooleanOperand(element: { type: string }): boolean {
	return (
		element.type === "rect" ||
		element.type === "ellipse" ||
		element.type === "text"
	);
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

		const unit: "px" | "%" = element.borderRadiusUnit === "%" ? "%" : "px";
		const linked = element.borderRadiusLinked !== false;
		const base = element.borderRadius ?? 0;
		const rawTL = linked ? base : (element.borderRadiusTL ?? base);
		const rawTR = linked ? base : (element.borderRadiusTR ?? base);
		const rawBR = linked ? base : (element.borderRadiusBR ?? base);
		const rawBL = linked ? base : (element.borderRadiusBL ?? base);

		const halfMin = Math.min(element.width, element.height) / 2;
		const toPx = (v: number) =>
			Math.max(
				0,
				unit === "%"
					? Math.min(
							((v / 100) * Math.min(element.width, element.height)) / 2,
							halfMin,
						)
					: Math.min(v, element.width / 2, element.height / 2),
			);
		const tl = round(toPx(rawTL));
		const tr = round(toPx(rawTR));
		const br = round(toPx(rawBR));
		const bl = round(toPx(rawBL));

		const allSame = tl === tr && tr === br && br === bl;

		if (allSame && tl <= 0) {
			return `M ${x} ${y} H ${right} V ${bottom} H ${x} Z`;
		}

		if (allSame) {
			return [
				`M ${round(x + tl)} ${y}`,
				`H ${round(right - tl)}`,
				`Q ${right} ${y} ${right} ${round(y + tl)}`,
				`V ${round(bottom - tl)}`,
				`Q ${right} ${bottom} ${round(right - tl)} ${bottom}`,
				`H ${round(x + tl)}`,
				`Q ${x} ${bottom} ${x} ${round(bottom - tl)}`,
				`V ${round(y + tl)}`,
				`Q ${x} ${y} ${round(x + tl)} ${y}`,
				"Z",
			].join(" ");
		}

		return [
			`M ${round(x + tl)} ${y}`,
			`L ${round(right - tr)} ${y}`,
			`Q ${right} ${y} ${right} ${round(y + tr)}`,
			`L ${right} ${round(bottom - br)}`,
			`Q ${right} ${bottom} ${round(right - br)} ${bottom}`,
			`L ${round(x + bl)} ${bottom}`,
			`Q ${x} ${bottom} ${x} ${round(bottom - bl)}`,
			`L ${x} ${round(y + tl)}`,
			`Q ${x} ${y} ${round(x + tl)} ${y}`,
			"Z",
		].join(" ");
	}

	return null;
}
