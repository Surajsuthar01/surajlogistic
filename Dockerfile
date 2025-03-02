# Use an official Nginx image as the base image
FROM nginx:alpine

# Copy the application files to the Nginx web root
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
