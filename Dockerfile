# Web app (Next.js + Prisma).
#
# NEXT_PUBLIC_* and APP_PASSWORD are baked into the bundle at build time, so docker-compose.yml
# passes the .env values in as build args. After changing them, rebuild:
#   docker compose up -d --build web

FROM node:20-slim AS build
WORKDIR /app
# Prisma's engine needs openssl.
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_STT_WS_URL
ARG APP_PASSWORD
ARG APP_SESSION_SECRET
# DATABASE_URL is not connected at build time — a dummy value satisfies prisma generate /
# next build, and the real one arrives from the environment at runtime.
ENV NEXT_PUBLIC_STT_WS_URL=$NEXT_PUBLIC_STT_WS_URL \
    APP_PASSWORD=$APP_PASSWORD \
    APP_SESSION_SECRET=$APP_SESSION_SECRET \
    DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npm run build

FROM node:20-slim
WORKDIR /app
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
# Apply pending migrations, then serve. `migrate deploy` only rolls forward and is a no-op
# when the schema is current, so restarting is safe. (The pre-1.0 image used `db push`, which
# would silently diverge from the migration history.)
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
