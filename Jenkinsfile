@Library('lab-lib') _
pipeline {
    agent { label 'docker' }

    options{
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    environment {
        IMAGE_NAME = 'registry:5000/viscord-user-service'
    }

    stages {
        stage('Lint and test') {
            agent { docker { image 'node:22.13-alpine'; reuseNode true } }
            stages {
                stage('Install') {
                    steps {
                        sh 'npm ci'
                    }
                }
                stage ('Lint') {
                    steps {
                        sh 'npx eslint "{src,apps,libs,test}/**/*.ts"'
                    }
                }
                stage ('Test') {
                    steps {
                        sh 'npm run test'
                    }
                }
            }
        }
        stage('Build and push docker image') {
            when {
                anyOf {
                    branch 'develop'
                    branch 'ci/jenkins'
                }
            }
            steps {
                script {
                    env.IMAGE_TAG = "sha-${env.GIT_COMMIT.take(7)}"
                }
                dockerBuildPush(image: 'registry:5000/viscord-user-service', tag: env.IMAGE_TAG)
            }
        }
        stage('Trigger dev deployment') {
            when {
                anyOf {
                    branch 'develop'
                    branch 'ci/jenkins'
                }
            }
            steps {
                build job: '/deploy/user-service-dev',
                    parameters: [string(name: 'IMAGE_TAG', value: env.IMAGE_TAG)],
                    wait: false
            }
        }
    }

    post {
        always {
            sh 'docker logout registry:5000 || true'
            cleanWs()
        }
    }
}