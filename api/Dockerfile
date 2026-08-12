# ProfAI API — Azure Functions (Node 20) in a container
FROM --platform=linux/amd64 mcr.microsoft.com/azure-functions/node:4-node20

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true \
    AzureWebJobsStorage="" \
    AzureWebJobsSecretStorageType=files \
    FUNCTIONS_WORKER_RUNTIME=node

WORKDIR /home/site/wwwroot

# Install deps first (cached layer). npm ci pulls the LINUX builds of
# ffmpeg-static, sharp and the Prisma engines inside the container.
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate && npm run build

# uploads dir (mounted as a volume in docker-compose so files survive restarts)
RUN mkdir -p /home/site/wwwroot/uploads /data

# On start: create/update the SQLite schema, then launch the Functions host
CMD ["bash", "-lc", "npx prisma db push --skip-generate && exec /azure-functions-host/Microsoft.Azure.WebJobs.Script.WebHost"]
