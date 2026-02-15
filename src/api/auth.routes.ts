import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { signToken, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Check if user exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await query<{ id: number }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id`,
      [email, passwordHash, displayName || null],
    );

    const token = signToken({ userId: result.rows[0].id, email });

    res.status(201).json({ token, userId: result.rows[0].id });
  } catch {
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await query<{ id: number; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({ userId: user.id, email });
    res.json({ token, userId: user.id });
  } catch {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await query(
    `SELECT id, email, display_name, subscription_status, subscription_plan,
            membership_shares, membership_since, created_at
     FROM users WHERE id = $1`,
    [req.user!.userId],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json(result.rows[0]);
});

export const authRoutes = router;
