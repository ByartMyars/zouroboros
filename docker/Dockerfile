# Zouroboros Docker Image
FROM oven/bun:1-alpine

# Install dependencies
RUN apk add --no-cache \
    git \
    sqlite \
    curl \
    nodejs \
    npm

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/*/package.json ./packages/*/
COPY cli/package.json ./cli/
COPY tui/package.json ./tui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm run build

# Link CLI
RUN cd cli && pnpm link --global

# Create volume for workspace
VOLUME ["/workspace"]

# Environment variables
ENV ZO_WORKSPACE=/workspace
ENV NODE_ENV=production

# Expose port for potential web interface
EXPOSE 3000

# Default command
CMD ["zouroboros", "doctor"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD zouroboros doctor --quiet || exit 1