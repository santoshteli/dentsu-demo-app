# dentsu-demo-app

A small Node.js REST API, built and deployed by Jenkins to a private Amazon EKS cluster behind a public ALB.

The infrastructure (VPC, EKS 1.36, AWS Load Balancer Controller, Jenkins host and the infra pipeline) is in the companion repo: **[santoshteli/dentsu-demo](https://github.com/santoshteli/dentsu-demo)**.

## Endpoints

| Method and path | Response |
|---|---|
| `GET /health` | `200 {"status":"ok"}`. Used by the readiness and liveness probes and the ALB health check. |
| `GET /users` | `200` with a JSON list of users |

## Run locally

Requires Node.js 24 LTS.

```bash
npm ci
npm test      # node:test, no extra test framework
npm start     # http://localhost:3000
curl localhost:3000/health
curl localhost:3000/users
```

## Docker

Multi-stage build: the first stage runs `npm ci` and the tests, the second contains production dependencies only and runs as the non-root `node` user.

```bash
docker build -t dentsu-demo-app:local .
docker run --rm -p 3000:3000 dentsu-demo-app:local
curl localhost:3000/health
```

## Layout

```
src/app.js          Express app (exported for tests)
src/server.js       starts the app on 0.0.0.0:3000, shuts down cleanly on SIGTERM
test/app.test.js    tests for /health, /users and 404
Dockerfile          multi-stage, npm ci, non-root
```
