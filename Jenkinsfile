pipeline {
    agent any
    stages {
        stage('Checkout') {
            steps {
                git branch: 'main', url: 'https://github.com/Surajsuthar01/demo-repo.git'
            }
        }
        stage('Build Docker Image') {
            steps {
                sh 'sudo docker build -t my-app .'
            }
        }
        stage('Deploy Docker Container') {
            steps {
                sh 'sudo docker stop my-app || true'
                sh 'sudo docker rm my-app || true'
                sh 'sudo docker run -d -p 80:80 --name my-app my-app'
            }
        }
    }
}
