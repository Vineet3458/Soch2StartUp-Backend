# ── Stage 1: Dependencies & Production Image ────────────────
FROM node:20-alpine AS runner

# Install curl for container health check
RUN apk add --no-cache curl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY server.js ./
COPY src/ ./src/

# Use the non-root node user provided by the alpine node image
USER node

# Expose backend API port
EXPOSE 5000

# Container healthcheck testing /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start server
CMD ["node", "server.js"]
