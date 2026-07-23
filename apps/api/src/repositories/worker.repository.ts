import { valkeyReader, valkeyWriter } from "../config/valkey.js";

export class WorkerRepository {
  static async getActiveWorkerKeys(): Promise<string[]> {
    const keys = await valkeyReader.keys("workers:presence:*");
    return keys
      .map((k) => String(k))
      .filter((key) => !key.startsWith("workers:presence:api:"));
  }

  static async getActiveWorkersCount(): Promise<number> {
    const keys = await this.getActiveWorkerKeys();
    const uniqueWorkerIds = new Set(
      keys.map((key) => {
        const parts = key.split(":");
        return parts.length >= 3 ? parts[2] : key;
      })
    );
    return uniqueWorkerIds.size;
  }

  static async publishPresence(nodeId: string, payload: unknown): Promise<void> {
    const key = `workers:presence:api:${nodeId}`;
    await valkeyWriter.set(key, JSON.stringify(payload), "EX", 15);
  }
}
