import type { RealtimeChannel, RealtimeChannelSendResponse } from "@supabase/supabase-js";

type BroadcastResult = RealtimeChannelSendResponse | "not-ready";

interface SendRealtimeBroadcastOptions {
	restFallback?: boolean;
	timeout?: number;
}

export function isRealtimeChannelReady(channel: RealtimeChannel): boolean {
	return channel.state === "joined" && channel.socket.isConnected();
}

export async function sendRealtimeBroadcast(
	channel: RealtimeChannel,
	event: string,
	payload: Record<string, unknown>,
	options: SendRealtimeBroadcastOptions = {},
): Promise<BroadcastResult> {
	if (!isRealtimeChannelReady(channel)) {
		if (!options.restFallback) {
			return "not-ready";
		}

		try {
			await channel.httpSend(
				event,
				payload,
				options.timeout ? { timeout: options.timeout } : undefined,
			);
			return "ok";
		} catch {
			return "error";
		}
	}

	return channel.send(
		{
			type: "broadcast",
			event,
			payload,
		},
		options.timeout ? { timeout: options.timeout } : undefined,
	);
}
