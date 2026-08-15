import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";

/**
 * Validate username format
 * Rules:
 * - Only alphanumeric characters, dashes, and underscores
 * - Cannot start with a dash or underscore
 * - Cannot end with a dash or underscore
 * - Minimum 3 characters, maximum 30 characters
 */
export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!username) {
    return { valid: false, error: "Username is required" };
  }
  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters long" };
  }
  if (username.length > 30) {
    return { valid: false, error: "Username must be at most 30 characters long" };
  }
  if (username[0] === "-" || username[0] === "_") {
    return { valid: false, error: "Username cannot start with a dash or underscore" };
  }
  if (username[username.length - 1] === "-" || username[username.length - 1] === "_") {
    return { valid: false, error: "Username cannot end with a dash or underscore" };
  }
  const usernameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  if (!usernameRegex.test(username)) {
    return { valid: false, error: "Username can only contain letters, numbers, dashes, and underscores" };
  }
  return { valid: true };
}

/**
 * Generate a random username using unique-username-generator
 * Produces names like "HappyBlueFish4821", "AngryRedWolf9234"
 */
export function generateUsername(): string {
  const base = uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    style: "capital",
    separator: "",
  });
  const number = Math.floor(Math.random() * 90 + 10); // 10–99
  return `${base}${number}`;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format (basic - accepts 10+ digits)
 */
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^\d{10,}$/;
  return phoneRegex.test(phone.replace(/\D/g, ""));
}

/**
 * Validate a required text field with optional max length
 */
export function validateTextField(
  value: string,
  fieldName: string,
  maxLength: number
): { valid: boolean; error?: string } {
  if (!value || !value.trim()) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (value.trim().length > maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${maxLength} characters` };
  }
  return { valid: true };
}

/**
 * Validate a public profile URL - must be a valid https URL
 */
export function validateProfileUrl(url: string): { valid: boolean; error?: string } {
  if (!url || !url.trim()) {
    return { valid: true }; // optional field
  }
  if (url.length > 500) {
    return { valid: false, error: "Profile URL must be at most 500 characters" };
  }
  try {
    const urlObj = new URL(url);
    if (urlObj.protocol !== "https:" && urlObj.protocol !== "http:") {
      return { valid: false, error: "Must be a valid URL (e.g. https://linkedin.com/in/yourname)" };
    }
  } catch {
    return { valid: false, error: "Must be a valid URL (e.g. https://linkedin.com/in/yourname)" };
  }
  return { valid: true };
}

/**
 * Validate a star rating is between 1 and 5
 */
export function validateRating(value: number, fieldName: string): { valid: boolean; error?: string } {
  if (value < 1 || value > 5) {
    return { valid: false, error: `${fieldName} must be between 1 and 5` };
  }
  return { valid: true };
}
