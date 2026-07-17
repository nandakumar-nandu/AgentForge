import rateLimit from 'express-rate-limit';
import { Request } from 'express';
import { AuthenticatedRequest } from './auth';

/**
 * ============================================================================
 * WHY RATE LIMITING MATTERS:
 * ============================================================================
 * 
 * Rate limiting is a foundational security control designed to govern the volume of
 * requests sent to API servers. It serves four main objectives:
 * 
 * 1. Denial-of-Service (DoS) and DDoS Mitigation:
 *    Prevents malicious actors or buggy clients from overwhelming the Express event
 *    loop with high-frequency HTTP requests, ensuring service availability.
 * 
 * 2. Resource Starvation & API Abuse:
 *    AI Agent operations (like invoking LLM API engines) are resource-intensive
 *    and incur direct financial costs. Restricting execution submissions protects
 *    the business from runaway API bills or rate-limit lockouts from OpenAI/Claude.
 * 
 * 3. Brute Force Defense:
 *    Throttling authentication endpoints (register, login) makes automated credential
 *    stuffing or password-guessing attacks mathematically impractical.
 * 
 * 4. Cluster Stability:
 *    Spreading request loads evenly across server nodes keeps thread heaps stable and
 *    ensures latency remains low for all authenticated clients.
 * ============================================================================
 */

/**
 * General Rate Limiter: Protects public / status / dashboard routes.
 * Limits requests to 100 per 15-minute window per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: {
    message: 'Too many requests from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Job Submission Rate Limiter: Throttles batch task submissions.
 * Limits requests to 10 per hour per authenticated User (falling back to IP).
 */
export const jobLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit to 10 jobs per hour
  keyGenerator: (req: Request): string => {
    const authReq = req as AuthenticatedRequest;
    // Track submissions per user account if authenticated, fallback to IP address
    return authReq.user?.userId || req.ip || 'anonymous';
  },
  message: {
    message: 'Too many job runs triggered from this account. Limit is 10 batch submissions per hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
