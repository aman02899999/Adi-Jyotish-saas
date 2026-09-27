import { describe, expect, it, vi } from "vitest";

import { retryOnUniqueViolation } from "@/lib/postgres";

const uniqueViolation = Object.assign(new Error("duplicate key"), { code: "23505" });

describe("retryOnUniqueViolation", () => {
  it("retries once after a unique violation and returns the retry's result", async () => {
    const write = vi.fn().mockRejectedValueOnce(uniqueViolation).mockResolvedValueOnce("updated");
    await expect(retryOnUniqueViolation(write)).resolves.toBe("updated");
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    const write = vi.fn().mockRejectedValue(uniqueViolation);
    await expect(retryOnUniqueViolation(write)).rejects.toBe(uniqueViolation);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("never retries any other error", async () => {
    const other = Object.assign(new Error("fk"), { code: "23503" });
    const write = vi.fn().mockRejectedValue(other);
    await expect(retryOnUniqueViolation(write)).rejects.toBe(other);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
