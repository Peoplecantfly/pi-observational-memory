import { afterEach, describe, expect, it } from "vitest";

import { runObserver } from "../src/agents/observer/agent.js";
import { reportWorkerUsage } from "../src/usage-reporter.js";

const REPORT_KEY = Symbol.for("pi-tracker.reportUsage");

function assistantEndEvent(usage: unknown): any {
	return { type: "message_end", message: { role: "assistant", stopReason: "stop", usage } };
}

function messageUpdateEvent(usage: unknown): any {
	return { type: "message_update", message: { role: "assistant", usage } };
}

function fakeAgentLoop(events: any[]): any {
	return ((_prompts: any[], _context: any, _config: any) => ({
		async *[Symbol.asyncIterator]() {
			for (const event of events) yield event;
		},
		result: async () => ({}),
	})) as any;
}

describe("reportWorkerUsage", () => {
	afterEach(() => {
		delete (globalThis as Record<PropertyKey, unknown>)[REPORT_KEY];
	});

	const model = { provider: "lm-studio", id: "lfm2.5-1.2b-thinking-mlx" } as any;
	const message = {
		role: "assistant",
		usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15, cost: { total: 0 } },
	} as any;

	it("is a no-op when pi-tracker is not installed", () => {
		expect(() => reportWorkerUsage(message, model, { cwd: "/x" })).not.toThrow();
	});

	it("forwards usage to the registered reporter with model + session meta", () => {
		const seen: any[] = [];
		(globalThis as Record<PropertyKey, unknown>)[REPORT_KEY] = (report: any) => seen.push(report);

		reportWorkerUsage(message, model, { cwd: "/proj", sessionId: "sess-1" });

		expect(seen).toEqual([
			{
				provider: "lm-studio",
				model: "lfm2.5-1.2b-thinking-mlx",
				usage: message.usage,
				cwd: "/proj",
				sessionId: "sess-1",
			},
		]);
	});

	it("never throws when the reporter throws", () => {
		(globalThis as Record<PropertyKey, unknown>)[REPORT_KEY] = () => {
			throw new Error("boom");
		};
		expect(() => reportWorkerUsage(message, model)).not.toThrow();
	});

	it("skips messages without usage", () => {
		const seen: any[] = [];
		(globalThis as Record<PropertyKey, unknown>)[REPORT_KEY] = (report: any) => seen.push(report);
		reportWorkerUsage({ role: "assistant" } as any, model);
		expect(seen).toEqual([]);
	});
});

describe("worker agents report each completed assistant turn once", () => {
	it("runObserver calls onAssistantEnd only for message_end assistant events", async () => {
		const reported: any[] = [];
		await runObserver({
			model: {} as any,
			apiKey: "test",
			priorReflections: [],
			priorObservations: [],
			chunk: "[Source entry id: entry-a]\nUser asked for a memory update.",
			allowedSourceEntryIds: ["entry-a"],
			agentLoop: fakeAgentLoop([
				messageUpdateEvent({ totalTokens: 3 }), // partial — must NOT be reported
				assistantEndEvent({ input: 1, output: 2, totalTokens: 3 }),
				{ type: "message_end", message: { role: "user", stopReason: "stop" } }, // non-assistant — must NOT be reported
			]),
			onAssistantEnd: (message: any) => reported.push(message),
		});

		expect(reported).toHaveLength(1);
		expect(reported[0].usage.totalTokens).toBe(3);
	});
});
