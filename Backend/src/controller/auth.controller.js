const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const RefreshToken = require('../models/refresh-token.model');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOKIE = 'refreshToken';

function refreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

function clearRefreshCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function publicUser(user) {
  return { id: user.id, email: user.email };
}

function createAccessToken(user) {
  return jwt.sign({}, process.env.ACCESS_TOKEN_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

async function issueSession(user, res) {
  const tokenId = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { jti: tokenId },
    process.env.REFRESH_TOKEN_SECRET,
    {
      subject: user.id,
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    },
  );

  await RefreshToken.create({
    tokenId,
    tokenHash: hashToken(refreshToken),
    user: user.id,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  });

  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  return { accessToken: createAccessToken(user), user: publicUser(user) };
}

function validCredentials(email, password) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    typeof password === 'string' &&
    password.length >= 8 &&
    Buffer.byteLength(password, 'utf8') <= 72
  );
}

async function register(req, res) {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body ?? {};

  if (!validCredentials(email, password)) {
    return res.status(400).json({
      error: 'Enter a valid email and a password of 8 to 72 bytes.',
    });
  }

  try {
    const user = await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 12),
    });
    const session = await issueSession(user, res);
    return res.status(201).json(session);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    throw error;
  }
}

async function login(req, res) {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const { password } = req.body ?? {};

  if (
    typeof password !== 'string' ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254
  ) {
    return res.status(400).json({ error: 'Enter a valid email and password.' });
  }

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }

  return res.json(await issueSession(user, res));
}

async function refresh(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) {
    return res.status(401).json({ error: 'Refresh token is missing or expired.' });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is invalid or expired.' });
  }

  if (
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    typeof payload.jti !== 'string'
  ) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token is invalid.' });
  }

  const session = await RefreshToken.findOneAndDelete({
    tokenId: payload.jti,
    tokenHash: hashToken(token),
    user: payload.sub,
    expiresAt: { $gt: new Date() },
  });

  if (!session) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Refresh token has already been used or revoked.' });
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    clearRefreshCookie(res);
    return res.status(401).json({ error: 'Account no longer exists.' });
  }

  return res.json(await issueSession(user, res));
}

async function logout(req, res) {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await RefreshToken.deleteOne({ tokenHash: hashToken(token) });
  }
  clearRefreshCookie(res);
  return res.status(204).end();
}

module.exports = {
  register,
  login,
  refresh,
  logout,
};
