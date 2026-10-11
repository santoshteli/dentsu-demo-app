// CI/CD pipeline for dentsu-demo-app.
//
// Runs on the Jenkins host inside the VPC as the jenkins user, with the host's
// instance role: ECR login and kubectl use temporary IAM credentials,
// so no AWS keys or registry passwords are stored in Jenkins.
//
// Stages: checkout, npm ci and test, docker build, push to ECR (tag = git SHA),
// deploy with kubectl, wait for the rollout (automatic rollback if it fails),
// then print and smoke-test the public ALB URL.
//
// Works on a freshly created cluster: the deploy stage applies every manifest,
// including the namespace and the Ingress that creates the ALB.

pipeline {
    agent any

    // GitHub webhooks cannot reach a private Jenkins, so poll for new commits.
    triggers {
        pollSCM('H/2 * * * *')
    }

    options {
        disableConcurrentBuilds()
        timestamps()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    environment {
        AWS_REGION         = 'ap-south-1'
        AWS_DEFAULT_REGION = 'ap-south-1'
        ECR_REPOSITORY     = 'dentsu-demo-app'
        NODE_IMAGE         = 'node:24.21.0-alpine3.24'
        CLUSTER_NAME       = 'dentsu-demo'
        APP_NAMESPACE      = 'dentsu-demo-app'
        APP_NAME           = 'dentsu-demo-app'
        KUBECONFIG         = "${WORKSPACE}/.kube/config"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_SHA = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                    // Built at run time so the account ID is never stored in this public repo.
                    def account = sh(returnStdout: true, script: 'aws sts get-caller-identity --query Account --output text').trim()
                    env.REGISTRY = "${account}.dkr.ecr.${env.AWS_REGION}.amazonaws.com"
                    env.IMAGE = "${env.REGISTRY}/${env.ECR_REPOSITORY}:${env.GIT_SHA}"
                }
                echo "Commit ${env.GIT_SHA}, image ${env.IMAGE}"
            }
        }

        stage('npm ci and test') {
            steps {
                // Node is not installed on the host; run npm in the same Node
                // image the Dockerfile uses, as the jenkins user, so the
                // workspace files stay owned by jenkins.
                sh '''
                    docker run --rm \
                      --user "$(id -u):$(id -g)" \
                      -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
                      -v "$WORKSPACE":/app -w /app \
                      "$NODE_IMAGE" sh -c "npm ci --no-audit --no-fund && npm test"
                '''
            }
        }

        stage('Docker build') {
            steps {
                // The image build runs the tests again in its build stage.
                sh 'docker build -t "$IMAGE" .'
            }
        }

        stage('Push to ECR') {
            steps {
                sh '''
                    # ECR tags are immutable: a rebuild of the same commit must not push again.
                    if aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$GIT_SHA" >/dev/null 2>&1; then
                        echo "$IMAGE is already in ECR, skipping the push."
                    else
                        aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
                        docker push "$IMAGE"
                    fi
                '''
            }
        }

        stage('Deploy to EKS') {
            steps {
                script {
                    if (sh(returnStatus: true, script: 'aws eks describe-cluster --name "$CLUSTER_NAME" >/dev/null 2>&1') != 0) {
                        error("Cluster ${env.CLUSTER_NAME} not found. Create it first: dentsu-infra, ACTION=apply, STACK=all.")
                    }
                }
                sh '''
                    mkdir -p "$(dirname "$KUBECONFIG")"
                    aws eks update-kubeconfig --name "$CLUSTER_NAME" --kubeconfig "$KUBECONFIG" >/dev/null

                    # Service and Ingress before the Deployment, so the Load Balancer
                    # Controller can add ALB readiness gates to the new pods.
                    kubectl apply -f k8s/namespace.yaml -f k8s/service.yaml -f k8s/ingress.yaml
                    sed "s|IMAGE_PLACEHOLDER|$IMAGE|" k8s/deployment.yaml | kubectl apply -f -
                '''
            }
        }

        stage('Rollout status') {
            steps {
                script {
                    // Waits until the new pods are Ready, which includes the ALB
                    // reporting them healthy (readiness gates).
                    def rc = sh(returnStatus: true, script: 'kubectl -n "$APP_NAMESPACE" rollout status deployment/"$APP_NAME" --timeout=10m')
                    if (rc != 0) {
                        sh '''
                            kubectl -n "$APP_NAMESPACE" get pods -o wide || true
                            # On a first deploy there is no previous version to return to.
                            kubectl -n "$APP_NAMESPACE" rollout undo deployment/"$APP_NAME" || true
                            kubectl -n "$APP_NAMESPACE" rollout status deployment/"$APP_NAME" --timeout=5m || true
                        '''
                        error("Rollout of ${env.IMAGE} failed; rolled back to the previous version if there was one.")
                    }
                }
                sh 'kubectl -n "$APP_NAMESPACE" get deployment,pods -o wide'
            }
        }

        stage('ALB URL') {
            steps {
                script {
                    // A new ALB takes a few minutes to get an address and DNS.
                    def host = ''
                    for (int i = 0; i < 30 && !host; i++) {
                        host = sh(returnStdout: true, script: 'kubectl -n "$APP_NAMESPACE" get ingress "$APP_NAME" -o jsonpath="{.status.loadBalancer.ingress[0].hostname}"').trim()
                        if (!host) { sleep 10 }
                    }
                    if (!host) {
                        unstable('The Ingress has no ALB address yet. Check: kubectl -n dentsu-demo-app describe ingress dentsu-demo-app')
                        return
                    }
                    env.APP_URL = "http://${host}"
                    def ok = sh(returnStatus: true, script: '''
                        for i in $(seq 1 18); do
                            if curl -fsS -m 5 "$APP_URL/health"; then echo; exit 0; fi
                            echo "Waiting for the ALB to answer ($i/18)..."
                            sleep 10
                        done
                        exit 1
                    ''') == 0
                    if (ok) {
                        sh 'curl -fsS -m 5 "$APP_URL/users"; echo'
                    } else {
                        unstable("Deployed, but ${env.APP_URL} did not answer yet. New ALB DNS can take a few more minutes.")
                    }
                }
            }
        }
    }

    post {
        success {
            echo "Deployed ${env.IMAGE}"
            echo "Application URL: ${env.APP_URL}/users  (health: ${env.APP_URL}/health)"
        }
        cleanup {
            // Do not leave a registry login on disk.
            sh 'docker logout "$REGISTRY" >/dev/null 2>&1 || true'
        }
    }
}
