# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source code
COPY . .

# Run build script (TypeScript checking + Vite build)
RUN npm run build

# Stage 2: Production Nginx server
FROM nginx:1.25-alpine

# Copy static assets from build stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
