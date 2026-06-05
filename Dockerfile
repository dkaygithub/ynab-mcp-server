FROM node:lts-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies for a leaner runtime image
RUN npm prune --omit=dev

ENV PORT=4322
ENV HOST=0.0.0.0
# YNAB_API_TOKEN is injected at runtime via --env-file / compose env_file.

EXPOSE 4322
CMD ["node", "dist/httpServer.js"]
