import { describe, it, expect, vi, beforeEach } from "vitest";
import { SseService, BufferedSession } from "../../../core/sse/sse.service";
import { redisStream } from "../../../config/redis";
import type { Response, Request } from "express";
import { eventBus } from "../../../core/bus/eventBus";
import { JobEvents } from "../../../modules/job/job.events";

describe("SseService & BufferedSession", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		SseService.init();
	});

	it("BufferedSession - should write SSE format and flush", () => {
		const writtenChunks: string[] = [];
		let flushed = false;
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			flush: vi.fn(() => {
				flushed = true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "job-1");
		expect(session.isConnected).toBe(true);

		session.push({ hello: "world" }, "custom.event", "100-0");

		expect(writtenChunks.length).toBe(1);
		expect(writtenChunks[0]).toContain("event: custom.event\n");
		expect(writtenChunks[0]).toContain("id: 100-0\n");
		expect(writtenChunks[0]).toContain('data: {"hello":"world"}\n\n');
		expect(flushed).toBe(true);
	});

	it("BufferedSession - should deduplicate older redis IDs", () => {
		const writtenChunks: string[] = [];
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "job-1");
		session.push("chunk1", "job.progress", "100-1");
		session.push("chunk2", "job.progress", "100-0"); // Older ID -> ignored
		session.push("chunk3", "job.progress", "100-1"); // Equal ID -> ignored
		session.push("chunk4", "job.progress", "101-0"); // Newer ID -> accepted

		expect(writtenChunks.length).toBe(2);
	});

	it("BufferedSession - destroy should close connection", async () => {
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn(),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "job-1");
		session.destroy();
		expect(session.isConnected).toBe(false);
	});

	it("SseService - should format frontend payload correctly", () => {
		const tokenPayload = SseService.toFrontendPayload({
			event: "job.progress",
			data: { kind: "token", status: "IN_PROGRESS", chunk: "Hello" },
		});
		expect(tokenPayload).toEqual({
			kind: "token",
			status: "IN_PROGRESS",
			chunk: "Hello",
		});

		const statePayload = SseService.toFrontendPayload({
			event: "job.completed",
			data: {
				kind: "state",
				status: "COMPLETED",
				job_id: "j-1",
				statistics: {},
			},
		});
		expect(statePayload).toEqual({ kind: "state", status: "COMPLETED", job_id: "j-1", statistics: {} });
	});

	it("SseService - setup sessions headers correctly", async () => {
		const headers: Record<string, string> = {};
		const mockRes = {
			writeHead: vi.fn((_status: number, h: Record<string, string>) => {
				Object.assign(headers, h);
			}),
			write: vi.fn(),
			on: vi.fn(),
			flush: vi.fn(),
		} as unknown as Response;
		const mockReq = { headers: { origin: "https://agelid.com" } } as unknown as Request;

		const jobSession = await SseService.setupJobSession(mockReq, mockRes, "job-123");
		expect(mockRes.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
		expect(headers["Content-Type"]).toContain("text/event-stream");
		expect(jobSession).toBeInstanceOf(BufferedSession);

		const convSession = await SseService.setupConversationSession(mockReq, mockRes, "conv-123");
		expect(convSession).toBeInstanceOf(BufferedSession);

		const statusSession = await SseService.setupStatusSession(mockReq, mockRes);
		expect(statusSession).toBeInstanceOf(BufferedSession);
	});

	it("SseService - syncHistory should replay past messages from Redis Stream", async () => {
		vi.spyOn(redisStream, "xRange").mockResolvedValue([
			{
				id: "100-0",
				message: {
					event: "job.progress",
					data: JSON.stringify({ event: "job.progress", data: { kind: "token", chunk: "Test history" } }),
				},
			},
		] as any);

		const writtenChunks: string[] = [];
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "job-1");
		await SseService.syncHistory("job-1", session, "prod");

		expect(writtenChunks.length).toBe(1);
		expect(writtenChunks[0]).toContain("Test history");
	});

	it("SseService - should broadcast tokenEmitted event to attached sessions", async () => {
		const writtenChunks: string[] = [];
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "broadcast-job");
		SseService.registerSession("broadcast-job", session);

		eventBus.emit(JobEvents.tokenEmitted, {
			jobId: "broadcast-job",
			eventId: "500-0",
			env: "prod",
			envelope: {
				event: "job.progress",
				data: {
					kind: "token",
					chunk: "Realtime token",
					status: "IN_PROGRESS",
					job_id: "broadcast-job",
					dev: "false",
				},
			},
		});

		expect(writtenChunks.length).toBe(1);
		expect(writtenChunks[0]).toContain("Realtime token");
	});

	it("SseService - should close conversation sessions with job.cancelled event", () => {
		const writtenChunks: string[] = [];
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "conv:conv-to-delete");
		SseService.registerConversationSession("conv-to-delete", session);

		SseService.closeConversationSessions("conv-to-delete", "Discussion supprimée");

		expect(writtenChunks.length).toBe(1);
		expect(writtenChunks[0]).toContain("event: job.cancelled\n");
		expect(writtenChunks[0]).toContain('"status":"CANCELLED"');
		expect(writtenChunks[0]).toContain('"error":"Discussion supprimée"');
		expect(session.isConnected).toBe(false);
	});

	it("SseService - should close job sessions with job.cancelled event", () => {
		const writtenChunks: string[] = [];
		const mockRes = {
			on: vi.fn(),
			writableEnded: false,
			write: vi.fn((data: string) => {
				writtenChunks.push(data);
				return true;
			}),
			end: vi.fn(),
		} as unknown as Response;

		const session = new BufferedSession(mockRes, "job-to-cancel");
		SseService.registerSession("job-to-cancel", session);

		SseService.closeJobSessions("job-to-cancel", "Job annulé par l'utilisateur");

		expect(writtenChunks.length).toBe(1);
		expect(writtenChunks[0]).toContain("event: job.cancelled\n");
		expect(writtenChunks[0]).toContain('"status":"CANCELLED"');
		expect(session.isConnected).toBe(false);
	});
});
