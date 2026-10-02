import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The admin sign-in page read the database to decide between "sign in" and "create the owner
 * account", and a spent Firestore quota made it fail with a 500. It must render instead, and an
 * outage must never be mistaken for "no administrators yet", which would offer the owner set-up
 * form to anyone.
 */
const getAdminCount = vi.fn();
vi.mock("@/lib/admin-auth", () => ({ getAdminCount, getCurrentAdmin: async () => null }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn(), Link: ({ children }: { children: unknown }) => children }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/components/brand-mark", () => ({ BrandMark: () => null }));
vi.mock("@/components/admin-auth-form", () => ({ AdminAuthForm: ({ setup }: { setup: boolean }) => createElement("form", { "data-setup": String(setup) }) }));

const { default: AdminLoginPage } = await import("./page");
const render = async () => renderToStaticMarkup((await AdminLoginPage()) as ReactElement);

describe("admin sign-in page", () => {
  it("still renders the sign-in form, with a notice, when the database quota is spent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getAdminCount.mockRejectedValue(Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 }));
    const html = await render();
    expect(html).toContain('data-setup="false"');
    expect(html).toContain("reach the studio database right now");
    error.mockRestore();
  });

  it("offers owner set-up only when the database answers that there are no administrators", async () => {
    getAdminCount.mockResolvedValue(0);
    expect(await render()).toContain('data-setup="true"');
    getAdminCount.mockResolvedValue(2);
    const html = await render();
    expect(html).toContain('data-setup="false"');
    expect(html).not.toContain("reach the studio database");
  });
});
