# 🚚 Surajlogistic Website  

A modern and responsive **logistics website** designed by **Suraj Suthar**.  
This project demonstrates **web design, containerization (Docker), and automation (Ansible & Jenkins)** for DevOps practice.  

---

## 📸 Website Preview  

![Surajlogistic Preview](readme-images/website-preview.png)  

---

## 📂 Repository Structure  

```surajlogistic/
│
├── ansible/ # Ansible playbooks for provisioning
│ └── provision.yml
│
├── assets/ # Website assets (images, css, js, etc.)
│
├── readme-images/ # Screenshots used in documentation
│
├── Dockerfile # Docker build configuration
├── Jenkinsfile # Jenkins pipeline configuration
├── README.md # Project documentation
├── favicon.svg # Website favicon
├── index.html # Main website file
├── index.txt # Reference / backup content
├── style-guide.md # Style and contribution guide
```

## ⚙️ Setup Instructions  

### 1️⃣ Clone this repository  
git clone https://github.com/Surajsuthar01/surajlogistic.git
cd surajlogistic
2️⃣ Open index.html in your browser
bash
Copy code
open index.html   # Mac
xdg-open index.html  # Linux
# Or just double-click on index.html in Windows
🐳 Run with Docker
Build the Docker image
bash
Copy code
docker build -t surajlogistic .
Run the container
bash
Copy code
docker run -d -p 8080:80 surajlogistic
Now visit 👉 http://localhost:8080

🤖 CI/CD with Jenkins
This repo includes a Jenkinsfile for pipeline automation:

🔨 Build the Docker image

🧪 Run container tests

🚀 Deploy to server

📝 Author
## 👤 Suraj Suthar
💡 Passionate about DevOps, Web Development, and Cloud Computing

🌐 GitHub: Surajsuthar01


