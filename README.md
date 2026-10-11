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

## Kubernetes

Manifests in `k8s/`, for namespace `dentsu-demo-app`:

| File | Contents |
|---|---|
| `namespace.yaml` | Namespace, labelled for ALB pod readiness gates |
| `deployment.yaml` | 2 replicas, zero-downtime rolling update, readiness and liveness probes on `/health`, CPU and memory requests and limits, non-root with a read-only root filesystem |
| `service.yaml` | ClusterIP, port 80 to container port 3000 |
| `ingress.yaml` | `ingressClassName: alb`, internet-facing, `target-type: ip`, health check `/health` |

The image in `deployment.yaml` is `IMAGE_PLACEHOLDER`. The pipeline replaces it with `<ECR registry>/dentsu-demo-app:<git SHA>` at deploy time, so the AWS account ID is not stored in this repo. Manual deploy from inside the VPC:

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/service.yaml -f k8s/ingress.yaml
sed "s|IMAGE_PLACEHOLDER|$IMAGE|" k8s/deployment.yaml | kubectl apply -f -
kubectl -n dentsu-demo-app rollout status deploy/dentsu-demo-app
kubectl -n dentsu-demo-app get ingress   # ALB hostname
```

## CI/CD (Jenkins)

`Jenkinsfile` stages:

1. **Checkout**, and work out the image tag (the short git SHA).
2. **npm ci and test**, in the same Node image the Dockerfile uses.
3. **Docker build** (the build runs the tests again).
4. **Push to ECR**, skipped if that tag already exists (tags are immutable).
5. **Deploy to EKS**: `kubectl apply` of all manifests, with the image filled in.
6. **Rollout status**: waits for the new pods to be Ready and healthy behind the ALB. If the rollout fails, it runs `kubectl rollout undo` and fails the build.
7. **ALB URL**: prints the public URL and checks `/health` and `/users`.

It polls GitHub every 2 minutes, because a webhook cannot reach a private Jenkins, so a `git push` is deployed without anyone clicking Build. AWS access (ECR, EKS) uses the Jenkins host's IAM role; no credentials are stored in Jenkins.

To roll back by hand: `kubectl -n dentsu-demo-app rollout undo deployment/dentsu-demo-app`, or revert the commit and let the pipeline redeploy.

## Layout

```
src/app.js          Express app (exported for tests)
src/server.js       starts the app on 0.0.0.0:3000, shuts down cleanly on SIGTERM
test/app.test.js    tests for /health, /users and 404
Dockerfile          multi-stage, npm ci, non-root
k8s/                namespace, deployment, service, ingress
Jenkinsfile         CI/CD pipeline
```
