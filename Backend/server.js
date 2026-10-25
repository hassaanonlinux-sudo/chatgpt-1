const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const PORT = process.env.PORT || 5000;

const requiredEnvironmentVariables = [
  'MONGODB_URI',
  'GROQ_API_KEY',
  'ACCESS_TOKEN_SECRET',
  'REFRESH_TOKEN_SECRET',
];
const missingEnvironmentVariables = requiredEnvironmentVariables.filter(
  (name) => !process.env[name],
);

if (missingEnvironmentVariables.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvironmentVariables.join(', ')}`,
  );
}

const mongoose = require('mongoose');
const app = require('./src/app');

async function startServer() {
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exitCode = 1;
});
