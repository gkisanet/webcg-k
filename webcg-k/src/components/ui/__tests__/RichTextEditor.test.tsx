import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "../RichTextEditor";

describe("RichTextEditor", () => {
	it("does not emit onChange when syncing external content", async () => {
		const onChange = vi.fn();
		const { container, rerender } = render(
			<RichTextEditor content="첫 문장" onChange={onChange} />,
		);

		await waitFor(() => {
			expect(container.querySelector(".tiptap")).toHaveTextContent("첫 문장");
		});

		onChange.mockClear();
		rerender(<RichTextEditor content="교체된 문장" onChange={onChange} />);

		await waitFor(() => {
			expect(container.querySelector(".tiptap")).toHaveTextContent(
				"교체된 문장",
			);
		});
		expect(onChange).not.toHaveBeenCalled();
	});
});
