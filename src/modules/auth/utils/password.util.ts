// backend/src/modules/auth/utils/password.util.ts
import * as crypto from 'crypto';

/**
 * Hashes a plain-text password using Node.js built-in scrypt algorithm.
 * Output format: `<salt_hex>:<hash_hex>`
 */
export function hashPassword(password: string): string {
  // Generate random 16-byte salt to ensure identical passwords have unique hashes
  const salt = crypto.randomBytes(16).toString('hex');

  // Derive 64-byte key using scrypt
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${hash}`;
}

/**
 * Verifies a plain-text password against a stored `<salt>:<hash>` string using timing-safe comparison.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) {
    return false;
  }

  const [salt, key] = storedHash.split(':');
  if (!salt || !key) {
    return false;
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);

  // Buffer length must match exactly before comparing
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }

  // Use timingSafeEqual to protect against side-channel timing attacks
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}