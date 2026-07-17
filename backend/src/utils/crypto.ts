import crypto from 'crypto';

/**
 * ============================================================================
 * WHY API KEYS ARE ENCRYPTED AT REST:
 * ============================================================================
 * 
 * Third-party LLM API keys (OpenAI, Claude) are high-value secrets. If a database is
 * compromised (via SQL injection, misconfigured backup exposure, or authorization leaks),
 * storing keys in plaintext allows direct theft and abuse, leading to massive financial
 * liabilities or token abuse.
 * 
 * To prevent this, we encrypt API keys at rest using AES-256-CBC:
 * 1. Symmetric Encryption: We use a secret key (ENCRYPTION_KEY) stored in environmental settings.
 * 2. Unique Initialization Vector (IV): Every key gets a unique random IV so that the same
 *    API key string produces a different ciphertext block every time it's encrypted.
 * 3. Separation of Concerns: The database holds the ciphertext and IV, while the system
 *    server environment holds the ENCRYPTION_KEY. An attacker needs BOTH the database dumps
 *    and the server's environment configuration to decrypt the keys.
 * ============================================================================
 */

const ALGORITHM = 'aes-256-cbc';

// Resolve a 256-bit key from the environment, padding/truncating if necessary for fallback
const getEncryptionKey = (): Buffer => {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || envKey.trim() === '') {
    console.warn('[Crypto] Warning: ENCRYPTION_KEY is unconfigured inside backend/.env. Using default insecure fallback key.');
    return Buffer.from('f90a6e382d547f2e1a3d5b7c8e9f0c1b', 'hex'); // 16 bytes hex is 32 bytes string representation
  }
  
  // Hash the envKey to guarantee a solid 32-byte key regardless of input size
  return crypto.createHash('sha256').update(envKey).digest();
};

/**
 * Encrypts a plaintext string using AES-256-CBC
 */
export function encrypt(text: string): { encryptedData: string; iv: string } {
  const iv = crypto.randomBytes(16); // 16 bytes block size for AES-CBC
  const key = getEncryptionKey();
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypts a ciphertext string using AES-256-CBC and the original IV
 */
export function decrypt(encryptedText: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const key = getEncryptionKey();
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
