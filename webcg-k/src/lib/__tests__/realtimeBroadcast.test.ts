import { describe, expect, it, vi } from "vitest";
import {
	isRealtimeChannelReady,
	sendRealtimeBroadcast,
} from "../realtimeBroadcast";

function createChannelStub(options: {
	connected: boolean;
	state: "joined" | "joining" | "closed" | "errored" | "leaving";
	sendResult?: "ok" | "error" | "timed out";
	httpError?: Error;
}) {
	return {
		state: options.state,
		socket: {
			isConnected: vi.fn(() => options.connected),
		},
		send: vi.fn(async () => options.sendResult ?? "ok"),
		httpSend: vi.fn(async () => {
			if (options.httpError) throw options.httpError;
			return { success: true };
		}),
	};
}

describe("realtimeBroadcast", () => {
	it("uses websocket send when the channel is joined and connected", async () => {
		const channel = createChannelStub({ connected: true, state: "joined" });

		const result = await sendRealtimeBroadcast(
			channel as never,
			"playout",
			{ seqNum: 1 },
		);

		expect(result).toBe("ok");
		expect(isRealtimeChannelReady(channel as never)).toBe(true);
		expect(channel.send).toHaveBeenCalledWith(
			{
				type: "broadcast",
				event: "playout",
				payload: { seqNum: 1 },
			},
			undefined,
		);
		expect(channel.httpSend).not.toHaveBeenCalled();
	});

	it("returns not-ready without REST fallback for lossy presence events", async () => {
		const channel = createChannelStub({ connected: false, state: "joining" });

		const result = await sendRealtimeBroadcast(
			channel as never,
			"document-change",
			{ kind: "cursor" },
			{ restFallback: false },
		);

		expect(result).toBe("not-ready");
		expect(channel.send).not.toHaveBeenCalled();
		expect(channel.httpSend).not.toHaveBeenCalled();
	});

	it("uses explicit httpSend when REST fallback is requested before join", async () => {
		const channel = createChannelStub({ connected: false, state: "joining" });

		const result = await sendRealtimeBroadcast(
			channel as never,
			"document-change",
			{ kind: "stroke" },
			{ restFallback: true, timeout: 500 },
		);

		expect(result).toBe("ok");
		expect(channel.send).not.toHaveBeenCalled();
		expect(channel.httpSend).toHaveBeenCalledWith(
			"document-change",
			{ kind: "stroke" },
			{ timeout: 500 },
		);
	});

	it("maps explicit httpSend failures to error", async () => {
		const channel = createChannelStub({
			connected: false,
			state: "joining",
			httpError: new Error("network"),
		});

		const result = await sendRealtimeBroadcast(
			channel as never,
			"ack",
			{ seqNum: 1 },
			{ restFallback: true },
		);

		expect(result).toBe("error");
	});
});
