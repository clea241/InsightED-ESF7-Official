/**
 * Authentication & JWT Security Configuration
 *
 * Enforces runtime startup validation and minimum entropy requirements
 * (>= 256 bits / 32 characters) for JWT secrets to prevent token forgery.
 */

export const MIN_JWT_SECRET_LENGTH = 32;

/**
 * Validates the JWT secret from the environment.
 * Throws a fatal error if JWT_SECRET is unset, empty, or shorter than 32 characters.
 */
export function assertJwtSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "FATAL [Auth Config]: JWT_SECRET environment variable is missing or empty. A cryptographically secure secret (minimum 32 characters / 256 bits) is required.",
    );
  }

  if (secret.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `FATAL [Auth Config]: JWT_SECRET is too weak. Current length is ${secret.length} characters; minimum ${MIN_JWT_SECRET_LENGTH} characters required (256 bits).`,
    );
  }

  return secret;
}

/**
 * Retrieves the validated JWT secret.
 */
export function getJwtSecret(env: Record<string, string | undefined> = process.env): string {
  return assertJwtSecret(env);
}

// Runtime startup assertion:
// Immediately fail-fast on startup unless running inside a test suite where isolated envs are tested.
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  assertJwtSecret();
}

export const authConfig = {
  get jwtSecret(): string {
    return getJwtSecret();
  },
  minSecretLength: MIN_JWT_SECRET_LENGTH,
  assertJwtSecret,
  getJwtSecret,
};

export default authConfig;
