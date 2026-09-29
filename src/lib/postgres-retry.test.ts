import { describe, expect, it, vi } from "vitest";

import { retryOnInsertRace } from "@/lib/postgres";

const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });

describe("retryOnInsertRace", () => {
  it("retries once after a unique violation and returns the retry's result", async () => {
    const write = vi.fn().mockRejectedValueOnce(uniqueViolation).mockResolvedValueOnce("updated");
    await expect(retryOnInsertRace(write)).resolves.toBe("updated");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("retries once after a deadlock, which the same race raises when both inserts hold one index each", async () => {
    const deadlock = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const write = vi.fn().mockRejectedValueOnce(deadlock).mockResolvedValueOnce("updated");
    await expect(retryOnInsertRace(write)).resolves.toBe("updated");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    const write = vi.fn().mockRejectedValue(uniqueViolation);
    await expect(retryOnInsertRace(write)).rejects.toBe(uniqueViolation);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("never retries any other error", async () => {
    const other = Object.assign(new Error("fk"), { code: "23503" });
    const write = vi.fn().mockRejectedValue(other);
    await expect(retryOnInsertRace(write)).rejects.toBe(other);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
