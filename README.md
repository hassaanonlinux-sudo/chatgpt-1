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

`NEXT_PUBLIC_API_URL` and `FRONTEND_ORIGIN` are connected to the corresponding
Render service hostnames in the Blueprint. The app adds HTTPS for those
hostnames automatically. For manual service setup, use full URLs such as
`https://my-chatgpt-api.onrender.com` and
`https://my-chatgpt-ui.onrender.com`.
