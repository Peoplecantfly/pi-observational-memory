import type { AssistantMessage, Model } from "@earendil-works/pi-ai";

/**
 * Usage-reporting channel to pi-tracker (loaded in the same pi process).
 *
 * Worker model calls (observer/reflector/dropper) run outside the session's
 * agent loop, so their tokens never reach pi-tracker's `message_end` hook.
 * pi-tracker registers a reporter on this well-known process-global symbol;
 * each completed assistant message is forwarded to it. No-op when
 * pi-tracker is not installed — the symbol simply never resolves.
 */
const PI_TRACKER_REPORT_USAGE = Symbol.for("pi-tracker.reportUsage");

type PiTrackerUsageReport = {
	provider: string;
	model: string;
	usage: AssistantMessage["usage"];
	cwd?: string;
	sessionId?: string;
};

/** Forward one completed worker assistant message to pi-tracker, if present. Never throws. */
export function reportWorkerUsage(
	message: AssistantMessage,
	model: Model<any>,
	meta: { cwd?: string; sessionId?: string } = {},
): void {
	if (!message.usage) return;
	const reporter = (globalThis as Record<PropertyKey, unknown>)[PI_TRACKER_REPORT_USAGE];
	if (typeof reporter !== "function") return;
	try {
		(reporter as (report: PiTrackerUsageReport) => void)({
			provider: model.provider ?? "unknown",
			model: model.id ?? "unknown",
			usage: message.usage,
			cwd: meta.cwd,
			sessionId: meta.sessionId,
		});
	} catch {
		// analytics must never break a memory worker
	}
}
