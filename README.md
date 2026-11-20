# Soch2Startup – Backend (Express + MongoDB)

REST API + live event stream for the Soch2Startup platform.

```bash
cp .env.example .env      # then edit MONGO_URI / JWT_SECRET (and GEMINI_API_KEY if you have one)
npm install
npm run seed              # demo users + data for every role  (npm run seed -- --reset wipes first)
npm run dev               # http://localhost:5000
npm test                  # run all 37 unit, security, and integration tests
npm run test:unit         # run unit tests for the multi-model prediction council
npm run lint              # syntax and static integrity check (0 errors)
```

See the project-level `README.md` for architecture, features and demo accounts.

## Structure
```
server.js                  app bootstrap (helmet, CORS, metrics, static client)
src/config/                roles, default platform config, permission list
src/models/                User, Idea, Assignment, Feedback, Session, Notification,
                           Resource, Report, Request, Config, Log
src/controllers/           one file per domain
src/services/              realtime (SSE hub), aiService, configService, notify, logger, metrics, webhook
src/middleware/            auth (protect / authorize / perm / feature), errors
src/routes/index.js        every endpoint in one readable file
src/seed.js                demo data
```
