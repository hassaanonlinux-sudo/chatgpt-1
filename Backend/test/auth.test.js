const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const aiService = require('../src/services/ai.service');

process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret';
process.env.FRONTEND_ORIGIN = 'https://chat-ui-eight-peach.vercel.app';

const app = require('../src/app');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('chat generation requires an access token', async () => {
  const response = await fetch(`${baseUrl}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'hello' }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Authentication required.' });
});

test('chat generation reports AI provider failures', async () => {
  const originalGenerateContent = aiService.generateContent;
  aiService.generateContent = async () => {
    throw new Error('Provider unavailable.');
  };
  try {
    const accessToken = jwt.sign(
      { sub: 'test-user' },
      process.env.ACCESS_TOKEN_SECRET,
    );
    const response = await fetch(`${baseUrl}/api/ai/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: 'Review this code.' }),
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      error: 'Failed to generate content',
    });
  } finally {
    aiService.generateContent = originalGenerateContent;
  }
});

test('registration rejects invalid credentials before accessing MongoDB', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invalid', password: 'short' }),
  });

  assert.equal(response.status, 400);
});

test('login rejects invalid email input before accessing MongoDB', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'invalid', password: 'long-enough-password' }),
  });

  assert.equal(response.status, 400);
});

test('logout clears a session even when no refresh cookie is present', async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });

  assert.equal(response.status, 204);
});

test('production refresh cookies support cross-site frontend requests', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
    });

    assert.equal(response.status, 204);
    assert.match(response.headers.get('set-cookie'), /SameSite=None/i);
    assert.match(response.headers.get('set-cookie'), /Secure/i);
  } finally {
    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
});

test('Vercel frontend origin is allowed by CORS', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://chat-ui-eight-peach.vercel.app',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get('access-control-allow-origin'),
    'https://chat-ui-eight-peach.vercel.app',
  );
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('Google sign-in routes are no longer available', async () => {
  const response = await fetch(`${baseUrl}/api/auth/google`, {
    redirect: 'manual',
  });

  assert.equal(response.status, 404);
});
