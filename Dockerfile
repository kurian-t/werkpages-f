# ─────────────────────────────────────────────
# Stage 1: Build the React app
# ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (cached layer unless dependencies change)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

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

ARG VITE_POSTHOG_KEY=
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY

ARG VITE_POSTHOG_HOST=
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

RUN npm run build:client

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

# Bake in the Cloudflare Origin Pull CA cert (public cert, not a secret)
COPY cloudflare-origin-pull-ca.pem /etc/nginx/cloudflare-origin-pull-ca.pem

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
