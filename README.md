# Soch2StartUp – Backend

Node.js + Express + MongoDB + JWT + Gemini API.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in values (MongoDB URI, JWT secret, optional Gemini key).
3. `npm run seed` – creates the first superadmin.
4. `npm run dev` – starts the API on http://localhost:5000

## Folder structure
```
server.js              App entry point
src/config/            DB connection and role constants
src/models/            Mongoose schemas (User, Idea)
src/middleware/        JWT protect/authorize and error handlers
src/controllers/       Request logic (auth, ideas, admin)
src/routes/            URL to controller mapping
src/services/          Gemini AI integration
src/seed.js            Superadmin seeding script
```

## API
| Method | Endpoint | Access |
|---|---|---|
| POST | /api/auth/register, /api/auth/login | Public |
| GET | /api/auth/me | Logged in |
| POST/GET | /api/ideas | Logged in |
| GET | /api/ideas/compare?ids=a,b | Owner |
| GET/DELETE | /api/ideas/:id | Owner (staff can view) |
| POST | /api/ideas/:id/feedback | Mentor, Industry Expert |
| GET | /api/admin/stats, /users, /ideas | Admin, Superadmin |
| PATCH | /api/admin/users/:id/toggle | Admin, Superadmin |
| PATCH | /api/admin/users/:id/role | Superadmin |

Without `GEMINI_API_KEY` the API returns a demo analysis so everything still works.
