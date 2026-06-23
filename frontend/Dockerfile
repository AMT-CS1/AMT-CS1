FROM node:20-alpine

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Copy configuration and source files
COPY . .

EXPOSE 3000

# Start Next.js dev server with hot-reloading
CMD ["npm", "run", "dev"]
