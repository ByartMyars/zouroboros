FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml ./
COPY packages/*/package.json ./packages/*/
COPY cli/package.json ./cli/

# Install packages
RUN bun install

# Copy source
COPY . .

# Build
RUN bun run build

# Expose port
EXPOSE 3000

# Entrypoint
ENTRYPOINT ["./cli/bin/zouroboros"]
CMD ["--help"]
