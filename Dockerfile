# ─────────────────────────────────────────────
# Stage 1: Build the React app
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.14.0

# Copy package files first (cached layer unless dependencies change)
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy all source files
COPY . .

# Build the static frontend
ARG VITE_API_URL=https://ratemymanagers.ca
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_TURNSTILE_SITE_KEY=
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

ARG VITE_AUTH0_DOMAIN=
ENV VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN

ARG VITE_AUTH0_CLIENT_ID=
ENV VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID

ARG VITE_AUTH0_AUDIENCE=
ENV VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE

ARG VITE_POSTHOG_KEY=
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY

ARG VITE_POSTHOG_HOST=
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

RUN pnpm build:client

# ─────────────────────────────────────────────
# Stage 2: Serve with Nginx
# ─────────────────────────────────────────────
FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built React app from stage 1
COPY --from=builder /app/dist/spa /usr/share/nginx/html

# No Cloudflare origin-pull CA here. This container is not the edge: the RateMyManagers
# frontend owns 80/443, terminates TLS and runs ssl_verify_client, then proxies werkpages.com
# to us over the Docker network. nginx.conf in this image has no TLS directives, so the cert
# would be unused — and it is gitignored (*.pem), so COPYing it broke the CI build.

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
