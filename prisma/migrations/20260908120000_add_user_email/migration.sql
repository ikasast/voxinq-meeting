-- What somebody types to sign in. Separate from `username`, which stays the short handle the
-- avatar URL is built from.
ALTER TABLE "users" ADD COLUMN "email" TEXT;

-- An account made from a tailnet identity already has an email address: the tailnet login *is*
-- one. Backfilling from it is what keeps everybody who can sign in today able to sign in
-- tomorrow, rather than making the upgrade a thing each person has to be told about.
UPDATE "users" SET "email" = lower("tailscale_login") WHERE "tailscale_login" IS NOT NULL;

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
