#!/bin/sh
# Entrypoint of the web and STT images: fill in the secrets that were not given, then run the
# image's command.
#
# docker-compose.yml has a one-shot `secrets` service that generates random values into a
# volume the first time the stack starts, so that `docker compose up -d` works with no `.env`
# at all. This reads them back. A value that is already set -- from `.env`, or the
# environment -- always wins, which is what keeps an existing install exactly as it was.
#
# Each service is given only the files it needs (see the volumes in docker-compose.yml), and
# this reads only the files that are there. Without the directory, as under an older compose
# file or a native install, it does nothing at all.
set -e

dir=${VOXINQ_SECRETS_DIR:-/run/voxinq}

if [ -d "$dir" ]; then
  # Read a generated value, or nothing when this service was not given that file.
  secret() {
    if [ -r "$dir/$1" ]; then cat "$dir/$1"; fi
  }

  # Set NAME from FILE when NAME is unset or empty. Compose passes an unset variable on as an
  # empty string, so empty counts as unset here.
  fill() {
    eval "current=\${$1:-}"
    if [ -z "$current" ]; then
      value=$(secret "$2")
      if [ -n "$value" ]; then
        export "$1=$value"
      fi
    fi
  }

  fill STT_SECRET stt_secret
  fill VOXINQ_KEY_SECRET key_secret
  fill APP_SESSION_SECRET session_secret

  # The web app reaches the bundled database by its service name. Only built when nothing was
  # given, so a viewer pointed at another database keeps its own address.
  if [ -z "${DATABASE_URL:-}" ]; then
    password=$(secret postgres_password)
    if [ -n "$password" ]; then
      export DATABASE_URL="postgresql://${POSTGRES_USER:-voxinq}:${password}@db:5432/${POSTGRES_DB:-voxinq}"
    fi
  fi
fi

exec "$@"
