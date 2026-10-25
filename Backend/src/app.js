const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const app = express();

const aiRoutes = require('./routes/ai.routes');
const authRoutes = require('./routes/auth.routes');

const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const normalizedFrontendOrigin = /^[a-z][a-z\d+.-]*:\/\//i.test(frontendOrigin)
  ? frontendOrigin
  : `https://${frontendOrigin}`;

app.use(
  cors({
    origin: normalizedFrontendOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;