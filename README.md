# Soch2Startup — Backend API & Real-Time Engine

A modular, production-ready **Node.js (Express 5)** REST API and real-time **Server-Sent Events (SSE)** hub powering the Soch2Startup validation platform.

---

## Tech Stack & Architecture

- **Runtime & Framework:** Node.js (ES modules), Express 5
- **Database:** MongoDB 7+ via Mongoose 8 (compatible with local MongoDB and MongoDB Atlas)
- **Authentication & Security:** 
  - HS256 JSON Web Tokens (JWT) with immediate invalidation on password change (`passwordChangedAt`)
  - Salted Bcrypt hashing with length clamping to prevent DoS attacks
  - Role-based and permission-based authorization middleware (`protect`, `authorize`, `hasPerm`)
  - Helmet security headers: Content Security Policy (CSP), HTTP Strict Transport Security (HSTS), Permissions-Policy, Referrer-Policy, Cross-Origin-Resource-Policy
  - Rate limiting on global API routes, authentication endpoints, and AI analysis pipelines
  - Strict input sanitization preventing NoSQL operator injection and stored XSS
- **AI Prediction Council:**
  - Multi-model evaluation running up to 4 LLMs in parallel via OpenRouter (GPT-4o mini, Claude 3.5 Haiku, Gemini 2.0 Flash, Llama 3.3 70B) or Google Gemini
  - Outlier trimming, weighted consensus scoring, confidence metrics, and deterministic offline demo fallback
- **Live Market Signals:** Automated market news scraping (Google News RSS, DuckDuckGo, Bing) with Cheerio
- **Real-Time Engine:** Server-Sent Events (`/api/events`) broadcasting mutations to connected clients

---

## Project Structure

```
soch2startup-backend/
├── server.js                  # Application bootstrap, Helmet, CORS, proxy configuration
├── render.yaml                # Render Blueprint infrastructure-as-code deployment file
├── test-backend.test.mjs      # 28 integration & security tests
├── test-council.test.mjs      # 9 unit tests for AI Prediction Council & web parsers
├── src/
│   ├── config/
│   │   ├── db.js              # Mongoose connection with timeout & auto-reconnect
│   │   ├── defaults.js        # Default platform configuration & scoring weights
│   │   ├── permissions.js     # RBAC roles (entrepreneur, mentor, expert, admin, etc.)
│   │   └── rubrics.js         # Evaluation rubrics and scoring criteria
│   ├── controllers/           # Modular request handlers (auth, ideas, admin, mentor, etc.)
│   ├── middleware/            # Auth guards, role/permission verification, error middleware
│   ├── models/                # Mongoose data models (User, Idea, Assignment, Feedback, Log, etc.)
│   ├── routes/                # Express API routing table (all mounted under /api)
│   ├── services/              # AI Council, realtime SSE hub, logger, metrics, scraper
│   └── seed.js                # Database seeder populating test accounts across all roles
└── package.json               # Scripts, dependencies, and engines
```

---

## Available Scripts

From the `soch2startup-backend` directory:

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **Start Production** | `npm start` | Starts production server with `node server.js` |
| **Development** | `npm run dev` | Starts server with `nodemon` (auto-reload on changes) |
| **Database Seeder** | `npm run seed` | Seeds initial platform config and 14 demo accounts |
| **Database Reset** | `npm run seed -- --reset` | Wipes test collections and resets demo accounts |
| **All Automated Tests** | `npm test` | Runs the full 37 integration, security, and unit tests |
| **Council Unit Tests** | `npm run test:unit` | Runs the 9 prediction council scoring and parsing tests |
| **Linting & Syntax** | `npm run lint` | Runs `node --check` syntax integrity across all JS files |

---

## Environment Variables

Copy `.env.example` to `.env` to configure your environment:

```env
# ── Server ───────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# Allowed Frontend Origins (comma-separated):
CLIENT_URL=http://localhost:5173,http://127.0.0.1:5173

# Allow *.vercel.app preview branches:
ALLOW_VERCEL_PREVIEWS=true

# Keep false when frontend is hosted separately:
SERVE_CLIENT=false

# ── Database ─────────────────────────────────────────────
# Local MongoDB or MongoDB Atlas URI:
MONGO_URI=mongodb://127.0.0.1:27017/soch2startup

# ── Security ─────────────────────────────────────────────
JWT_SECRET=dev-jwt-secret-key-for-soch2startup-validation-platform
JWT_EXPIRES_IN=7d

# ── AI Evaluator & Search APIs (Optional) ────────────────
# Without keys, the platform operates in built-in deterministic demo mode.
OPENROUTER_API_KEY=
GEMINI_API_KEY=
TAVILY_API_KEY=
SERPER_API_KEY=
```

---

## Demo Accounts for Testing

When seeded (`npm run seed`), the database includes test accounts for every platform role:

| Role | Email | Password |
| :--- | :--- | :--- |
| **Founder (Entrepreneur)** | `entrepreneur@soch2startup.com` | `S2S#Founder!2026` |
| **Mentor** | `mentor@soch2startup.com` | `S2S#Mentor!2026` |
| **Industry Expert** | `expert@soch2startup.com` | `S2S#Expert!2026` |
| **Moderator** | `moderator@soch2startup.com` | `S2S#Moderator!2026` |
| **Admin** | `admin@soch2startup.com` | `S2S#Admin!2026` |
| **Superadmin** | `superadmin@soch2startup.com` | `S2S#SuperAdmin!2026` |

---

## Deploying to Render

1. Create a free **MongoDB Atlas** cluster and copy the connection string.
2. In [Render Dashboard](https://dashboard.render.com), click **New +** > **Web Service**.
3. Select your repository and specify:
   - **Root Directory:** `soch2startup-backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
4. Set Environment Variables:
   - `NODE_ENV` = `production`
   - `MONGO_URI` = *(your MongoDB Atlas connection string)*
   - `JWT_SECRET` = *(a secure 64-character random string)*
   - `CLIENT_URL` = `https://your-frontend.vercel.app`
   - `ALLOW_VERCEL_PREVIEWS` = `true`
5. Click **Create Web Service**. Render will build and deploy the API with health monitoring enabled.
