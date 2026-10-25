# Backend

## Setup

1. Add the variables from `.env.example` to `.env` and set the MongoDB
   connection string plus two distinct, randomly generated token secrets.
2. Install dependencies with `npm install`.
3. Start MongoDB, then run `npm run dev` (or `npm start`).

The API listens on port 5000 by default. `FRONTEND_ORIGIN` must match the
frontend's origin. The server will not start without MongoDB and both token
secrets configured.

## Authentication API

- `POST /api/auth/register` with `{ "email", "password" }` creates an account.
- `POST /api/auth/login` with `{ "email", "password" }` signs in.
- `POST /api/auth/refresh` rotates the HTTP-only refresh cookie and returns a
  new access token.
- `POST /api/auth/logout` revokes the refresh session and clears its cookie.

Registration and login return `{ "accessToken", "user": { "id", "email" } }`.
Include the returned access token in an Authorization bearer header when
calling the protected `POST /api/ai/generate` endpoint. Access tokens expire
after 15 minutes. Refresh tokens expire after seven days, are stored hashed in
MongoDB, and are rotated on refresh.

The AI endpoint answers general questions and can also help with coding and
code reviews. Send `{ "prompt": "..." }` for a new question, or include an
optional `history` array of up to 20 messages so follow-up questions can use
the conversation context. Each history message has a `role` of `user` or
`assistant` and a string `content`. The chat UI sends recent history
automatically.

For Render deployment, use the repository-root [`render.yaml`](../render.yaml)
Blueprint and follow the [deployment instructions](../README.md). The backend
requires `MONGODB_URI`, `GROQ_API_KEY`, `ACCESS_TOKEN_SECRET`,
`REFRESH_TOKEN_SECRET`, and the frontend's `FRONTEND_ORIGIN`.
