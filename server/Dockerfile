# Stage 1: Build stage
FROM node:20-alpine AS builder

# Install build dependencies for native modules like bcrypt
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests and prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (development + production) to build the app
RUN npm ci

# Copy the rest of the application source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript code
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

# Install openssl (required by Prisma Client on Alpine)
RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Copy built code, dependencies, and Prisma assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 5000

# Default command starts the primary Express server
CMD ["npm", "start"]
