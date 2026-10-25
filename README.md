# Deploying My ChatGPT

This project includes a Render Blueprint in [`render.yaml`](./render.yaml) for
the frontend and backend web services.

## Run locally

1. Copy `Backend/.env.example` to `Backend/.env` and replace the placeholders
   with a reachable MongoDB URI, a Groq API key, and two distinct token
   secrets. Keep real credentials in `.env`, never in `.env.example`.
2. Install dependencies with `npm install` in both `Backend` and `chat-ui`.
3. Start MongoDB and run the backend in one terminal:

   ```sh
   npm --prefix Backend run dev
   ```

4. Run the frontend in a second terminal:

   ```sh
   npm --prefix chat-ui run dev
   ```

The UI uses `http://localhost:5000` by default. If you change either local
port, set `NEXT_PUBLIC_API_URL` in `chat-ui/.env.local` and `FRONTEND_ORIGIN`
in `Backend/.env` to match.

## Deploy the frontend to Vercel

Set `NEXT_PUBLIC_API_URL` in the Vercel project to
`https://chatgpt-1-16fo.onrender.com`, then redeploy so the value is included
in the frontend build. This is also the frontend's configured default.

In the Render backend service settings, set `FRONTEND_ORIGIN` to the exact
origin of the deployed Vercel frontend:
`https://chat-ui-eight-peach.vercel.app` (no trailing slash). The Render
Blueprint sets this origin; sync the Blueprint or update the Render
environment variable manually, then redeploy the backend. If you use a custom
Vercel domain, use that origin instead. The backend CORS policy allows one
frontend origin, so Vercel preview deployments on different hostnames will
not be allowed unless the backend origin is changed to match.

## Deploy with Render

1. Push this project to a GitHub or GitLab repository.
2. In Render, choose **New + → Blueprint** and connect the repository.
3. Provide `MONGODB_URI` and `GROQ_API_KEY` when prompted:
   - `MONGODB_URI` should point to a reachable MongoDB database, such as
     MongoDB Atlas. Render's built-in database service is PostgreSQL and is not
     compatible with this app's MongoDB backend.
   - `GROQ_API_KEY` is the API key for the configured Groq model.
4. Deploy the Blueprint. Render creates both services, generates separate
   access-token and refresh-token secrets, and connects the frontend and API
   service URLs.

The Blueprint uses the free plan for both services. Free web services may spin
down when idle and take a little time to respond after their first request.

## Render service settings

| Service | Root directory | Build command | Start command |
| --- | --- | --- | --- |
| `my-chatgpt-api` | `Backend` | `npm ci` | `npm start` |
| `my-chatgpt-ui` | `chat-ui` | `npm ci && npm run build` | `npm start` |

`NEXT_PUBLIC_API_URL` points the frontend to the backend API, and
`FRONTEND_ORIGIN` must match the frontend's browser origin. For manual Render
frontend setup, use the full frontend URL as the origin; for a Vercel frontend,
use its Vercel origin instead.
