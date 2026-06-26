FROM node:22-alpine

# Install FFmpeg and basic build dependencies
RUN apk add --no-cache ffmpeg python3 make g++

WORKDIR /app

# Copy package configuration
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TS files
RUN npm run build

# Create directory for downloads/uploads
RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["npm", "run", "start"]
