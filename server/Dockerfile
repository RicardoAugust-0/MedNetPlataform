FROM node:18-alpine

WORKDIR /app

# Copy server package.json first
COPY server/package.json ./server/

# Install dependencies
WORKDIR /app/server
RUN npm install

# Copy shared code (needed for fatigueParser.js relative import)
WORKDIR /app
COPY package.json ./
COPY src/utils/fatigueParser.js ./src/utils/
COPY server/index.js ./server/

# Set working directory to server for execution
WORKDIR /app/server

EXPOSE 3000

ENV PORT=3000

CMD ["node", "index.js"]
