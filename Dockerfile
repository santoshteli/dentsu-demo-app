# syntax=docker/dockerfile:1

# Stage 1: install all dependencies and run the tests.
# A failing test fails the build, so a broken image can never be pushed.
FROM node:24.21.0-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY test ./test
RUN npm test

# Stage 2: runtime image with production dependencies and app code only.
FROM node:24.21.0-alpine3.24
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/src ./src

# The official image ships a non-root "node" user (UID 1000). The app files
# stay owned by root, so the process can read them but not change them.
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
