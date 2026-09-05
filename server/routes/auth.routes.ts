import { Router } from 'express';
import { registerUser, loginUser, getUserById } from '../db';
import { strictAuthMiddleware, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, restaurantName, concept, location } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'Email and password are required.' });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ success: false, error: 'Password must be at least 6 characters.' });
    }

    const result = await registerUser({
      email,
      password,
      name: name || 'Restaurant Manager',
      restaurantName: restaurantName || 'My Restaurant',
      concept,
      location,
    });

    return res
      .status(201)
      .json({ success: true, message: 'Account created successfully.', ...result });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res
      .status(400)
      .json({ success: false, error: error.message || 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'Email and password are required.' });
    }

    const result = await loginUser(email, password);
    return res.json({ success: true, message: 'Logged in successfully.', ...result });
  } catch (error: any) {
    console.error('Login error:', error);
    return res
      .status(401)
      .json({ success: false, error: error.message || 'Authentication failed.' });
  }
});

// POST /api/auth/demo
router.post('/demo', async (_req, res) => {
  try {
    const result = await loginUser('manager@rustictable.com', 'manager123');
    return res.json({
      success: true,
      message: 'Logged in as Demo General Manager.',
      ...result,
    });
  } catch (error: any) {
    console.error('Demo login error:', error);
    return res.status(500).json({ success: false, error: 'Demo account unavailable.' });
  }
});

// GET /api/auth/me
router.get('/me', strictAuthMiddleware, (req: AuthenticatedRequest, res) => {
  const user = getUserById(req.userId!);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }
  return res.json({ success: true, user });
});

export default router;
