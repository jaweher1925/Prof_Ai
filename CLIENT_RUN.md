# ProfAI — Run with Docker (no building needed)

This runs the app from prebuilt images. You only need Docker Desktop.

## 1. Install Docker Desktop
Download from https://www.docker.com/products/docker-desktop, install, and open it.
Wait until the Docker icon shows "running".

## 2. Put these files in one folder
- `docker-compose.yml`
- `.env`   (contains the API keys — see below)

## 3. Add the API keys
Create a file named `.env` next to `docker-compose.yml` with:

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
HEYGEN_API_KEY=...
ELEVENLABS_API_KEY=...
```

## 4. Start the app
Open a terminal in that folder and run:

```
docker compose up -d
```

The first time it downloads the images (a few minutes). Then open:

```
http://localhost:8080
```

## Stop / start again
```
docker compose down      # stop
docker compose up -d     # start again
```

Your data (database + generated videos) is kept in Docker volumes between restarts.
