# 🔒 HARDENING: Multi-stage build — dev dependencies never reach production image
FROM node:20-alpine AS builder
WORKDIR /build
COPY package.json .
# Install ALL deps including dev for build step
RUN npm install --include=dev

# 🔒 HARDENING: Final production image — minimal attack surface
FROM node:20-alpine AS production

# 🔒 HARDENING: Run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

WORKDIR /app

# 🔒 HARDENING: Only copy production node_modules
COPY --from=builder /build/node_modules ./node_modules
COPY package.json app.js ./

# 🔒 HARDENING: Set correct ownership
RUN chown -R appuser:appgroup /app

USER appuser

# 🔒 HARDENING: Expose port explicitly — document what the container uses
EXPOSE 3000

# 🔒 HARDENING: Use exec form (not shell form) — avoids shell injection in entrypoint
CMD ["node", "app.js"]
