import { Router, Response, Request } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth';
import { encrypt } from '../utils/crypto';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret-key-321';

/**
 * POST /api/auth/register
 * Hashes password, saves User profile to MongoDB database.
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password || username.trim() === '' || password.trim() === '') {
      return res.status(400).json({ message: 'Username and password fields are required' });
    }
    
    // Check if account name is already taken
    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(400).json({ message: 'Username is already taken' });
    }
    
    // Generate salt and hash the plaintext password
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password.trim(), salt);
    
    const user = new User({
      username: username.trim(),
      password: hashed
    });
    
    await user.save();
    
    res.status(201).json({ message: 'User registered successfully', userId: user._id });
  } catch (error: any) {
    console.error('Registration failure:', error);
    res.status(500).json({ message: 'Server error during registration', error: error.message });
  }
});

/**
 * POST /api/auth/login
 * Validates credentials and returns a signed 24h JWT.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const matches = await bcrypt.compare(password.trim(), user.password);
    if (!matches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Sign JWT token mapping userId and username payload properties
    const token = jwt.sign(
      { userId: user._id.toString(), username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        userId: user._id,
        username: user.username,
        hasOpenAIKey: !!user.openaiKeyEncrypted,
        hasClaudeKey: !!user.claudeKeyEncrypted
      }
    });
  } catch (error: any) {
    console.error('Login failure:', error);
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

/**
 * PUT /api/auth/keys
 * Receives third-party API keys, runs AES-256 encryption, and commits data to User model.
 */
router.put('/keys', authMiddleware, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const userId = authReq.user?.userId;
    const { openaiKey, claudeKey } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User profile not found' });
    }
    
    if (openaiKey !== undefined) {
      if (openaiKey.trim() === "") {
        user.openaiKeyEncrypted = undefined;
        user.openaiKeyIv = undefined;
      } else {
        const { encryptedData, iv } = encrypt(openaiKey.trim());
        user.openaiKeyEncrypted = encryptedData;
        user.openaiKeyIv = iv;
      }
    }
    
    if (claudeKey !== undefined) {
      if (claudeKey.trim() === "") {
        user.claudeKeyEncrypted = undefined;
        user.claudeKeyIv = undefined;
      } else {
        const { encryptedData, iv } = encrypt(claudeKey.trim());
        user.claudeKeyEncrypted = encryptedData;
        user.claudeKeyIv = iv;
      }
    }
    
    await user.save();
    
    res.status(200).json({
      message: 'Encrypted API keys updated successfully',
      keysState: {
        hasOpenAIKey: !!user.openaiKeyEncrypted,
        hasClaudeKey: !!user.claudeKeyEncrypted
      }
    });
  } catch (error: any) {
    console.error('API keys update failure:', error);
    res.status(500).json({ message: 'Server error saving API keys', error: error.message });
  }
});

export default router;
