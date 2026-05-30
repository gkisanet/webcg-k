import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	getSvgCompositionChildren,
	renderSvgBooleanGroup,
	renderSvgCompositionGroup,
	type SvgCompositionElement,
} from "../svgCompositionRenderer";

const elements: SvgCompositionElement[] = [
	{
		id: "group",
		type: "group",
		x: 0,
		y: 0,
		width: 200,
		height: 120,
		visible: true,
		parentId: null,
		clipContent: true,
		maskSourceId: "mask",
	},
	{
		id: "first",
		type: "rect",
		x: 10,
		y: 10,
		width: 50,
		height: 40,
		visible: true,
		parentId: "group",
		zIndex: 2,
		fill: { type: "solid", color: "#f00" },
	},
	{
		id: "mask",
		type: "ellipse",
		x: 20,
		y: 20,
		width: 60,
		height: 60,
		visible: true,
		parentId: "group",
		zIndex: 3,
	},
	{
		id: "hidden",
		type: "rect",
		x: 0,
		y: 0,
		width: 10,
		height: 10,
		visible: false,
		parentId: "group",
		zIndex: 1,
	},
];

describe("svgCompositionRenderer", () => {
	it("returns visible children sorted by zIndex", () => {
		expect(
			getSvgCompositionChildren(elements, "group").map((el) => el.id),
		).toEqual(["first", "mask"]);
	});

	it("renders group clip and mask definitions without rendering the mask source as a child", () => {
		const markup = renderToStaticMarkup(
			<svg role="img" aria-label="composition group test">
				{renderSvgCompositionGroup({
					element: elements[0],
					elements,
					idPrefix: "test",
					renderElement: (element) => (
						<rect key={element.id} data-id={element.id} />
					),
				})}
			</svg>,
		);

		expect(markup).toContain('clipPath id="test-clip-group"');
		expect(markup).toContain('mask id="test-mask-group"');
		expect(markup).toContain('data-id="first"');
		expect(markup).not.toContain('data-id="mask"');
	});

	it("renders subtract boolean groups through a shared SVG mask", () => {
		const booleanElements: SvgCompositionElement[] = [
			{
				id: "boolean",
				type: "boolean_group",
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				visible: true,
				parentId: null,
				booleanOperation: "subtract",
			},
			{
				id: "base",
				type: "rect",
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				visible: true,
				parentId: "boolean",
				zIndex: 1,
				fill: { type: "solid", color: "#123456", opacity: 0.5 },
			},
			{
				id: "cut",
				type: "ellipse",
				x: 25,
				y: 25,
				width: 50,
				height: 50,
				visible: true,
				parentId: "boolean",
				zIndex: 2,
			},
		];

		const markup = renderToStaticMarkup(
			<svg role="img" aria-label="boolean group test">
				{renderSvgBooleanGroup({
					element: booleanElements[0],
					elements: booleanElements,
					idPrefix: "test",
				})}
			</svg>,
		);

		expect(markup).toContain('mask id="test-boolean-mask-boolean"');
		expect(markup).toContain('fill="#123456"');
		expect(markup).toContain('fill-opacity="0.5"');
		expect(markup).toContain('fill="black"');
		expect(markup).toContain('fill="white"');
	});
});
