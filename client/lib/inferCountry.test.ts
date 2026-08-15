import { describe, it, expect, vi, afterEach } from "vitest";
import { inferCountry } from "./inferCountry";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inferCountry", () => {
  it("returns Canada for America/Toronto timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Toronto" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Canada");
  });

  it("returns Canada for America/Vancouver timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Vancouver" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Canada");
  });

  it("returns United States for America/New_York timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/New_York" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("United States");
  });

  it("returns United States for America/Los_Angeles timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Los_Angeles" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("United States");
  });

  it("returns United Kingdom for Europe/London timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Europe/London" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("United Kingdom");
  });

  it("returns Australia for Australia/Sydney timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Australia/Sydney" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Australia");
  });

  it("returns Germany for Europe/Berlin timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Europe/Berlin" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Germany");
  });

  it("returns India for Asia/Kolkata timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Kolkata" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("India");
  });

  it("returns Japan for Asia/Tokyo timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Tokyo" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Japan");
  });

  it("returns Brazil for America/Sao_Paulo timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Sao_Paulo" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Brazil");
  });

  it("returns Other for unknown timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Unknown/Timezone" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Other");
  });

  it("returns Other for empty timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Other");
  });

  it("returns Other when Intl throws", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("Intl not supported");
    });
    expect(inferCountry()).toBe("Other");
  });

  it("returns Singapore for Asia/Singapore timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Singapore" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Singapore");
  });

  it("returns New Zealand for Pacific/Auckland timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Pacific/Auckland" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("New Zealand");
  });

  it("returns South Africa for Africa/Johannesburg timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Africa/Johannesburg" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("South Africa");
  });

  it("returns China for Asia/Shanghai timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Asia/Shanghai" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("China");
  });

  it("returns Canada for America/Edmonton timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "America/Edmonton" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("Canada");
  });

  it("returns France for Europe/Paris timezone", () => {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone: "Europe/Paris" } as Intl.ResolvedDateTimeFormatOptions),
    } as Intl.DateTimeFormat);
    expect(inferCountry()).toBe("France");
  });
});
