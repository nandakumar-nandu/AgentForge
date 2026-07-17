import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Custom request interface extending standard Express Request to attach authenticated user context.
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

/**
 * ============================================================================
 * JWT (JSON WEB TOKEN) STRUCTURE AND VERIFICATION:
 * ============================================================================
 * 
 * JWT is an open standard (RFC 7519) that defines a compact, self-contained way for
 * securely transmitting information between parties as a JSON object.
 * 
 * JWT Structure:
 * 1. Header: Base64Url-encoded JSON specifying the token type (JWT) and signing
 *    algorithm (e.g. HS256).
 * 2. Payload: Base64Url-encoded JSON containing claims (e.g. userId, username,
 *    and expiration timestamp 'exp').
 * 3. Signature: Cryptographic hash produced by signing the encoded header +
 *    payload with the server's private JWT_SECRET.
 * 
 * Verification Mechanism:
 * - The server intercepts the HTTP request header 'Authorization: Bearer <token>'.
 * - It decodes the payload, validates that the expiration timestamp ('exp') is
 *   in the future, and signs it again using its local secret key.
 * - If the newly computed signature matches the third section of the incoming
 *   token, the identity of the sender is mathematically verified and trusted.
 * ============================================================================
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Auth Middleware] JWT header missing or malformed. Falling back to sandbox_user for local dashboard testing.');
      req.user = {
        userId: '60f79b001efab00123456789',
        username: 'sandbox_user'
      };
      return next();
    }
    return res.status(401).json({ message: 'Access Denied: Authorization token missing or malformed' });
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET || 'fallback-jwt-secret-key-321';

  try {
    const decoded = jwt.verify(token, secret) as { userId: string; username: string };
    
    // Attach the verified user details to the request context
    req.user = {
      userId: decoded.userId,
      username: decoded.username
    };
    
    next();
  } catch (error: any) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired access token', error: error.message });
  }
}
