/**
 * JWT Authentication Middleware
 *
 * Verifies bearer tokens against the high-entropy secret configured in src/config/auth.
 */
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/auth";

export interface JwtClaims {
  uid?: string;
  role?: string;
  school_id?: string;
  schoolId?: string;
  [key: string]: any;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: JwtClaims;
  auth?: {
    claims: JwtClaims;
    uid?: string;
    role?: string;
    schoolId?: string | null;
  };
  [key: string]: any;
}

export function extractBearerToken(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;

  const parts = authHeader.trim().split(" ");
  if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) return null;

  return parts[1] || null;
}

export function verifyJwtToken(token: string): JwtClaims {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, { algorithms: ["HS256"] }) as JwtClaims;
}

export function jwtMiddleware(req: AuthenticatedRequest, res: any, next: (err?: any) => void): void {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required: missing or malformed token." });
    return;
  }

  try {
    const claims = verifyJwtToken(token);
    req.user = claims;
    req.auth = {
      claims,
      uid: claims.uid,
      role: claims.role,
      schoolId: claims.school_id || claims.schoolId || null,
    };
    next();
  } catch (err: any) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

export default jwtMiddleware;
