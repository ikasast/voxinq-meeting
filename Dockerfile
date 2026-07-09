# Production image for Voxinq Web (Next.js).
# NEXT_PUBLIC_* and APP_PASSWORD are baked into the bundle at build time,
# so docker-compose.yml passes the .env values here as build args.
# After changing them, rebuild with `docker compose up -d --build`.

FROM node:20-slim AS build
WORKDIR /app
# The Prisma engine requires openssl
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_STT_WS_URL
ARG APP_PASSWORD
ARG APP_SESSION_SECRET
# DATABASE_URL is not connected at build time (a dummy for prisma generate / next build).
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
# Push the schema to the DB at startup, then start the server.
# Changes that drop tables/columns fail here -> run on the host:
# `docker compose run --rm web npx prisma db push --accept-data-loss`.
CMD ["sh", "-c", "npx prisma db push && npm run start"]
