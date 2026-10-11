// CI/CD pipeline for dentsu-demo-app.
//
// Runs on the Jenkins host inside the VPC as the jenkins user, with the host's
// instance role: ECR login and (later) kubectl use temporary IAM credentials,
// so no AWS keys or registry passwords are stored in Jenkins.
//
// Phase 5: CI only (test, build, push to ECR). Phase 6 adds the deploy stages.

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
    }

    post {
        success {
            echo "Image ready: ${env.IMAGE}"
        }
        cleanup {
            // Do not leave a registry login on disk.
            sh 'docker logout "$REGISTRY" >/dev/null 2>&1 || true'
        }
    }
}
