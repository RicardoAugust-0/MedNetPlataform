FROM node:22-alpine

WORKDIR /app

# Copy the dependency manifests first so production installs exactly the
# versions validated in this repository.
COPY server/package.json server/package-lock.json ./server/

# Install dependencies
WORKDIR /app/server
RUN npm ci --omit=dev

# Copy shared code (needed for fatigueParser.js and crosscheck/utils.js relative imports)
WORKDIR /app
COPY package.json ./
COPY src/utils/fatigueParser.js ./src/utils/
COPY src/modules/crosscheck/utils.js ./src/modules/crosscheck/
COPY server/ ./server/

# Set working directory to server for execution
WORKDIR /app/server

EXPOSE 3000

ENV PORT=3000

CMD ["node", "index.js"]
