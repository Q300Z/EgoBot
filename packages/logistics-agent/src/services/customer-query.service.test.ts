import { describe, expect, it, vi } from "vitest";
import type { LogisticsPrismaClient } from "../database/index.js";
import { CustomerQueryService } from "./index.js";

const customerId = "7ca2c025-ea9b-4d7e-8920-c4f5bc93a26f";
const email = "client@example.com";

function makePrisma(findUnique: ReturnType<typeof vi.fn>) {
  return {
    customer: { findUnique },
  } as unknown as LogisticsPrismaClient;
}

describe("CustomerQueryService.resolve", () => {
  it("refuse une identité vide sans interroger la base", async () => {
    const findUnique = vi.fn();
    const result = await new CustomerQueryService(makePrisma(findUnique)).resolve(
      { customerId: "  ", email: null },
    );

    expect(result).toEqual({
      resolved: false,
      reason: "NO_IDENTITY",
      message: expect.any(String),
    });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("résout par customerId lorsque le client est actif", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: customerId, email, isActive: true });

    const result = await new CustomerQueryService(makePrisma(findUnique)).resolve(
      { customerId },
    );

    expect(result).toEqual({
      resolved: true,
      customer: { customerId, email },
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: customerId } }),
    );
  });

  it("se replie sur l'email quand le customerId est inconnu", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: customerId, email, isActive: true });

    const result = await new CustomerQueryService(makePrisma(findUnique)).resolve(
      { customerId: "00000000-0000-4000-8000-000000000000", email },
    );

    expect(result).toEqual({
      resolved: true,
      customer: { customerId, email },
    });
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { email } }),
    );
  });

  it("refuse un client trouvé mais inactif", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValue({ id: customerId, email, isActive: false });

    const result = await new CustomerQueryService(makePrisma(findUnique)).resolve(
      { customerId },
    );

    expect(result).toEqual({
      resolved: false,
      reason: "INACTIVE",
      message: expect.any(String),
    });
  });

  it("renvoie NOT_FOUND quand rien ne correspond", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    const result = await new CustomerQueryService(makePrisma(findUnique)).resolve(
      { customerId, email },
    );

    expect(result).toEqual({
      resolved: false,
      reason: "NOT_FOUND",
      message: expect.any(String),
    });
  });

  it("normalise l'email en minuscules avant la requête", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);

    await new CustomerQueryService(makePrisma(findUnique)).resolve({
      email: "Foo@Bar.COM",
    });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "foo@bar.com" } }),
    );
  });
});
