export const SESSION_COOKIE_NAME = "tradedesk_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const getSecretKey = async (secret: string): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
};

export async function createSessionToken(): Promise<string> {
  const secret = process.env.SESSION_SECRET || "change-me-long-random";
  const key = await getSecretKey(secret);
  const expiresAt = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = new TextEncoder().encode(expiresAt.toString());
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, payload);
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${expiresAt}.${signatureHex}`;
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [expiresAtStr, sigHex] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt) || expiresAt < Date.now()) {
    return false;
  }

  const secret = process.env.SESSION_SECRET || "change-me-long-random";
  const key = await getSecretKey(secret);
  const payload = new TextEncoder().encode(expiresAtStr);

  // Convert sigHex back to Uint8Array
  if (sigHex.length !== 64) return false;
  const sigBytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    sigBytes[i] = parseInt(sigHex.substr(i * 2, 2), 16);
  }

  return crypto.subtle.verify("HMAC", key, sigBytes, payload);
}
