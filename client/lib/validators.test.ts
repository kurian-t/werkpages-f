import { describe, it, expect } from "vitest";
import {
  validateUsername,
  generateUsername,
  validateEmail,
  validatePhone,
  validateTextField,
  validateProfileUrl,
  validateRating,
} from "./validators";

describe("validateUsername", () => {
  it("rejects empty string", () => {
    expect(validateUsername("")).toEqual({ valid: false, error: "Username is required" });
  });

  it("rejects too short (2 chars)", () => {
    expect(validateUsername("ab")).toEqual({ valid: false, error: "Username must be at least 3 characters long" });
  });

  it("accepts minimum length (3 chars)", () => {
    expect(validateUsername("abc")).toEqual({ valid: true });
  });

  it("rejects too long (31 chars)", () => {
    expect(validateUsername("a".repeat(31))).toEqual({ valid: false, error: "Username must be at most 30 characters long" });
  });

  it("accepts maximum length (30 chars)", () => {
    expect(validateUsername("a".repeat(30))).toEqual({ valid: true });
  });

  it("rejects username starting with dash", () => {
    expect(validateUsername("-username")).toEqual({ valid: false, error: "Username cannot start with a dash or underscore" });
  });

  it("rejects username starting with underscore", () => {
    expect(validateUsername("_username")).toEqual({ valid: false, error: "Username cannot start with a dash or underscore" });
  });

  it("rejects username ending with dash", () => {
    expect(validateUsername("username-")).toEqual({ valid: false, error: "Username cannot end with a dash or underscore" });
  });

  it("rejects username ending with underscore", () => {
    expect(validateUsername("username_")).toEqual({ valid: false, error: "Username cannot end with a dash or underscore" });
  });

  it("rejects username with invalid characters", () => {
    expect(validateUsername("user@name")).toEqual({ valid: false, error: "Username can only contain letters, numbers, dashes, and underscores" });
  });

  it("rejects username with spaces", () => {
    expect(validateUsername("user name")).toEqual({ valid: false, error: "Username can only contain letters, numbers, dashes, and underscores" });
  });

  it("accepts valid username with letters and numbers", () => {
    expect(validateUsername("user123")).toEqual({ valid: true });
  });

  it("accepts valid username with dashes", () => {
    expect(validateUsername("user-name")).toEqual({ valid: true });
  });

  it("accepts valid username with underscores", () => {
    expect(validateUsername("user_name")).toEqual({ valid: true });
  });

  it("accepts single alphanumeric character", () => {
    expect(validateUsername("a")).toEqual({ valid: false, error: "Username must be at least 3 characters long" });
  });

  it("accepts mixed valid characters", () => {
    expect(validateUsername("My_User-123")).toEqual({ valid: true });
  });

  it("rejects username with dot", () => {
    expect(validateUsername("user.name")).toEqual({ valid: false, error: "Username can only contain letters, numbers, dashes, and underscores" });
  });
});

describe("generateUsername", () => {
  it("returns a non-empty string", () => {
    const result = generateUsername();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("generates different values each time", () => {
    const results = new Set(Array.from({ length: 10 }, () => generateUsername()));
    expect(results.size).toBeGreaterThan(1);
  });

  it("ends with a 2-digit number", () => {
    const result = generateUsername();
    expect(/\d{2}$/.test(result)).toBe(true);
  });
});

describe("validateEmail", () => {
  it("accepts valid email", () => {
    expect(validateEmail("user@example.com")).toBe(true);
  });

  it("accepts email with subdomain", () => {
    expect(validateEmail("user@mail.example.com")).toBe(true);
  });

  it("accepts email with plus sign", () => {
    expect(validateEmail("user+tag@example.com")).toBe(true);
  });

  it("rejects email without @", () => {
    expect(validateEmail("userexample.com")).toBe(false);
  });

  it("rejects email without domain", () => {
    expect(validateEmail("user@")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateEmail("")).toBe(false);
  });

  it("rejects email with spaces", () => {
    expect(validateEmail("user @example.com")).toBe(false);
  });

  it("rejects email without TLD", () => {
    expect(validateEmail("user@example")).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts 10-digit phone number", () => {
    expect(validatePhone("4165551234")).toBe(true);
  });

  it("accepts phone with dashes", () => {
    expect(validatePhone("416-555-1234")).toBe(true);
  });

  it("accepts phone with spaces", () => {
    expect(validatePhone("416 555 1234")).toBe(true);
  });

  it("accepts phone with parentheses", () => {
    expect(validatePhone("(416) 555-1234")).toBe(true);
  });

  it("accepts 11-digit phone", () => {
    expect(validatePhone("14165551234")).toBe(true);
  });

  it("rejects 9-digit phone (too short)", () => {
    expect(validatePhone("416555123")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validatePhone("")).toBe(false);
  });

  it("rejects letters only", () => {
    expect(validatePhone("abcdefghij")).toBe(false);
  });
});

describe("validateTextField", () => {
  it("rejects empty string", () => {
    expect(validateTextField("", "Name", 100)).toEqual({ valid: false, error: "Name is required" });
  });

  it("rejects whitespace-only string", () => {
    expect(validateTextField("   ", "Name", 100)).toEqual({ valid: false, error: "Name is required" });
  });

  it("rejects string exceeding max length", () => {
    expect(validateTextField("a".repeat(101), "Name", 100)).toEqual({ valid: false, error: "Name must be at most 100 characters" });
  });

  it("accepts string at exactly max length", () => {
    expect(validateTextField("a".repeat(100), "Name", 100)).toEqual({ valid: true });
  });

  it("accepts valid string", () => {
    expect(validateTextField("John Doe", "Name", 100)).toEqual({ valid: true });
  });

  it("uses field name in error messages", () => {
    expect(validateTextField("", "Company", 50)).toEqual({ valid: false, error: "Company is required" });
  });

  it("trims before checking max length", () => {
    const trimmed = "a".repeat(100);
    const padded = "  " + trimmed.slice(0, 98) + "  "; // 102 chars total but 98 trimmed
    expect(validateTextField(padded, "Name", 100)).toEqual({ valid: true });
  });
});

describe("validateProfileUrl", () => {
  it("accepts empty string (optional field)", () => {
    expect(validateProfileUrl("")).toEqual({ valid: true });
  });

  it("accepts undefined-like empty", () => {
    expect(validateProfileUrl("   ")).toEqual({ valid: true });
  });

  it("rejects URL exceeding 500 characters", () => {
    expect(validateProfileUrl("https://example.com/" + "a".repeat(490))).toEqual({
      valid: false,
      error: "Profile URL must be at most 500 characters",
    });
  });

  it("accepts valid https URL", () => {
    expect(validateProfileUrl("https://linkedin.com/in/johndoe")).toEqual({ valid: true });
  });

  it("accepts valid http URL", () => {
    expect(validateProfileUrl("http://example.com/profile")).toEqual({ valid: true });
  });

  it("rejects non-http/https URL (ftp)", () => {
    expect(validateProfileUrl("ftp://files.example.com")).toEqual({
      valid: false,
      error: "Must be a valid URL (e.g. https://linkedin.com/in/yourname)",
    });
  });

  it("rejects invalid URL string", () => {
    expect(validateProfileUrl("not-a-url")).toEqual({
      valid: false,
      error: "Must be a valid URL (e.g. https://linkedin.com/in/yourname)",
    });
  });

  it("rejects URL with no protocol", () => {
    expect(validateProfileUrl("linkedin.com/in/johndoe")).toEqual({
      valid: false,
      error: "Must be a valid URL (e.g. https://linkedin.com/in/yourname)",
    });
  });
});

describe("validateRating", () => {
  it("accepts rating of 1", () => {
    expect(validateRating(1, "Overall")).toEqual({ valid: true });
  });

  it("accepts rating of 5", () => {
    expect(validateRating(5, "Overall")).toEqual({ valid: true });
  });

  it("accepts rating of 3", () => {
    expect(validateRating(3, "Overall")).toEqual({ valid: true });
  });

  it("rejects rating below 1", () => {
    expect(validateRating(0, "Overall")).toEqual({ valid: false, error: "Overall must be between 1 and 5" });
  });

  it("rejects rating above 5", () => {
    expect(validateRating(6, "Overall")).toEqual({ valid: false, error: "Overall must be between 1 and 5" });
  });

  it("rejects negative rating", () => {
    expect(validateRating(-1, "Communication")).toEqual({ valid: false, error: "Communication must be between 1 and 5" });
  });

  it("uses field name in error messages", () => {
    expect(validateRating(0, "Communication")).toEqual({ valid: false, error: "Communication must be between 1 and 5" });
  });

  it("accepts decimal ratings within range", () => {
    expect(validateRating(3.5, "Overall")).toEqual({ valid: true });
  });
});
