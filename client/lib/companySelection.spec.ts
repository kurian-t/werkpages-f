import { describe, expect, it, vi } from "vitest";
import { resolveCompanyPayload } from "./companySelection";

describe("resolveCompanyPayload", () => {
  it("keeps the casing the user typed when the company already exists", async () => {
    // The bug this exists to prevent. Company names are unique case-insensitively, so creating
    // "Central Rock Gym" returns the stored "Central rock gym". An admin correcting the
    // capitalisation had their own correction handed back to them, so Save appeared to do nothing.
    const create = vi.fn().mockResolvedValue({ id: 7, name: "Central rock gym" });

    const payload = await resolveCompanyPayload("Central Rock Gym", undefined, create);

    expect(payload).toEqual({ company: "Central Rock Gym", companyId: 7 });
  });

  it("still links to the company that already exists", async () => {
    // The casing is the display text; the row that came back is the identity. Correcting a name
    // must not fork a second company.
    const create = vi.fn().mockResolvedValue({ id: 7, name: "Central rock gym" });

    const payload = await resolveCompanyPayload("CENTRAL ROCK GYM", undefined, create);

    expect(payload.companyId).toBe(7);
    expect(create).toHaveBeenCalledWith("CENTRAL ROCK GYM");
  });

  it("uses a picked suggestion's id without creating anything", async () => {
    const create = vi.fn();

    const payload = await resolveCompanyPayload("Acme", 42, create);

    expect(payload).toEqual({ company: "Acme", companyId: 42 });
    expect(create).not.toHaveBeenCalled();
  });

  it("does not create a company from one character", async () => {
    const create = vi.fn();

    const payload = await resolveCompanyPayload("A", undefined, create);

    expect(payload).toEqual({ company: "A", companyId: null });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the name alone when creation fails, rather than losing the submission", async () => {
    const create = vi.fn().mockRejectedValue(new Error("network"));

    const payload = await resolveCompanyPayload("Acme", undefined, create);

    expect(payload).toEqual({ company: "Acme", companyId: null });
  });

  it("returns the name alone when the response carries no usable id", async () => {
    const create = vi.fn().mockResolvedValue({ name: "Acme" });

    const payload = await resolveCompanyPayload("Acme", undefined, create);

    expect(payload).toEqual({ company: "Acme", companyId: null });
  });
});
