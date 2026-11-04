/**
 * Username rules, shared by signup, login, and settings.
 *
 * Pure (no server-only) so the signup form can validate inline before submit.
 * The username→email resolution itself runs ONLY server-side via the service
 * role — usernames are never enumerable by the browser.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

/** Blocked to prevent impersonation, route confusion, and abuse. */
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "staff", "support", "help", "billing",
  "login", "logout", "signin", "signup", "sign_in", "sign_up", "onboarding",
  "portal", "account", "accounts", "settings", "api", "auth", "callback",
  "mailbox", "mailboxos", "postalannex", "owner", "manager", "moderator", "mod",
  "system", "null", "undefined", "me", "you", "user", "users", "test", "tests",
  "security", "abuse", "postmaster", "webmaster", "noreply", "no_reply", "info",
  "contact", "sales", "legal", "privacy", "terms", "status", "about", "home",
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Returns a human error message, or null when the username is acceptable. */
export function validateUsername(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  }
  if (!USERNAME_REGEX.test(u)) {
    return "Use only lowercase letters, numbers, and underscores.";
  }
  if (RESERVED_USERNAMES.has(u)) {
    return "That username isn't available.";
  }
  return null;
}
