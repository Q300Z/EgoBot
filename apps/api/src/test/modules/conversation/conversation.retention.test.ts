import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConversationRepository } from "../../../modules/conversation/ConversationRepository";
import { prisma } from "../../../config/db";

describe("Conversation Retention Policy", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("should soft delete inactive conversations older than 15 days", async () => {
		const mockUpdateMany = vi.spyOn(prisma.conversation, "updateMany").mockResolvedValue({ count: 3 } as any);

		const cleanedCount = await ConversationRepository.softDeleteInactiveOlderThan(15);

		expect(cleanedCount).toBe(3);
		expect(mockUpdateMany).toHaveBeenCalledWith({
			where: {
				deleted_at: null,
				updated_at: { lt: expect.any(Date) },
			},
			data: {
				deleted_at: expect.any(Date),
			},
		});
	});

	it("should hard purge deleted conversations older than 180 days (6 months)", async () => {
		const mockFindMany = vi.spyOn(prisma.conversation, "findMany").mockResolvedValue([
			{ id: "conv-old-1" },
			{ id: "conv-old-2" },
		] as any);

		const mockJobDeleteMany = vi.spyOn(prisma.job, "deleteMany").mockResolvedValue({ count: 2 } as any);
		const mockMessageDeleteMany = vi.spyOn(prisma.message, "deleteMany").mockResolvedValue({ count: 5 } as any);
		const mockConvDeleteMany = vi.spyOn(prisma.conversation, "deleteMany").mockResolvedValue({ count: 2 } as any);
		const mockTransaction = vi.spyOn(prisma, "$transaction").mockResolvedValue([
			{ count: 2 },
			{ count: 5 },
			{ count: 2 },
		] as any);

		const purgedCount = await ConversationRepository.purgeDeletedOlderThan(180);

		expect(purgedCount).toBe(2);
		expect(mockFindMany).toHaveBeenCalledWith({
			where: {
				deleted_at: { lte: expect.any(Date) },
			},
			select: { id: true },
		});
		expect(mockTransaction).toHaveBeenCalled();
	});

	it("should return 0 purged when no conversations are older than 180 days", async () => {
		vi.spyOn(prisma.conversation, "findMany").mockResolvedValue([] as any);
		const mockTransaction = vi.spyOn(prisma, "$transaction");

		const purgedCount = await ConversationRepository.purgeDeletedOlderThan(180);

		expect(purgedCount).toBe(0);
		expect(mockTransaction).not.toHaveBeenCalled();
	});
});
