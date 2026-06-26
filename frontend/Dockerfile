FROM node:22-alpine

WORKDIR /app

# Copy package config
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build Next.js application
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]
