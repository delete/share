// Crypto utilities using the Web Crypto API (available in the Workers runtime).

const encoder = new TextEncoder();

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Generates a short, URL-safe (base62) id from random bytes. */
export function randomId(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += B62[b % 62];
  return out;
}

/** Management token (used to delete/inspect the doc). 256-bit hex. */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface PasswordHash {
  salt: string; // base64
  hash: string; // base64
  iterations: number;
}

const PBKDF2_ITERATIONS = 100_000;

/** Derives a PBKDF2-SHA256 hash of the password with a random salt. */
export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return {
    salt: toBase64(salt),
    hash: toBase64(new Uint8Array(bits)),
    iterations: PBKDF2_ITERATIONS,
  };
}

/** Verifies a password against a stored hash, in constant time. */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const salt = fromBase64(stored.salt);
  const bits = await deriveBits(password, salt, stored.iterations);
  return timingSafeEqual(new Uint8Array(bits), fromBase64(stored.hash));
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Signs `${id}.${exp}` with HMAC-SHA256 for the unlock cookie. */
export async function signUnlock(id: string, exp: number, secret: string): Promise<string> {
  const payload = `${id}.${exp}`;
  const mac = await hmac(payload, secret);
  return `${payload}.${mac}`;
}

/** Validates the unlock cookie; returns true if the signature matches and it hasn't expired. */
export async function verifyUnlock(value: string, id: string, secret: string, now: number): Promise<boolean> {
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [cookieId, expStr, mac] = parts;
  if (cookieId !== id) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < now) return false;
  const expected = await hmac(`${cookieId}.${expStr}`, secret);
  return timingSafeEqual(encoder.encode(mac), encoder.encode(expected));
}

async function hmac(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64(new Uint8Array(sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
