import * as authService from '../services/auth.service.js';

export async function register(req, res, next) {
  try {
    // Public self-signup is disabled. New client onboarding is handled by the Sales team / ChiefAdmin.
    return res.status(403).json({ error: 'Signup is disabled. Please contact sales to onboard.' });
    const { email, password, businessName } = req.body || {};
    if (!email || !password || !businessName) {
      return res.status(400).json({ error: 'email, password, and businessName are required' });
    }
    const result = await authService.register({ email, password, businessName });
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (e) {
    next(e);
  }
}
