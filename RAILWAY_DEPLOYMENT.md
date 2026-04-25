# Railway Deployment Guide

This project is ready to deploy as two Railway services:
- `backend` (FastAPI + PostgreSQL)
- `frontend` (static files via Python HTTP server)

## 1) Deploy Backend Service

1. Create a new Railway project from your GitHub repo.
2. Add a service using the `backend` folder.
3. Set:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements-prod.txt`
   - Start Command: `gunicorn -w 2 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:$PORT main:app`
4. Add variables:
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=<strong_password>`
5. Add PostgreSQL plugin and set:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
6. Deploy and verify:
   - `https://<backend-domain>/api/health`

## 2) Deploy Frontend Service

1. Add another service from the same repo using the `frontend` folder.
2. Set:
   - Root Directory: `frontend`
   - Build Command: (leave empty)
   - Start Command: `python -m http.server $PORT`
3. In `frontend/config.js`, set:

```js
window.APP_CONFIG = {
  API_BASE: "https://<backend-domain>/api"
};
```

4. Redeploy frontend.

## 3) RAG Endpoints

- Ask jobs (RAG): `GET /api/rag/ask?q=<question>&k=6`
- Ask jobs (RAG + free LLM fallback): `GET /api/rag/ask_llm?q=<question>&k=6`
- Rebuild index (admin): `POST /api/rag/reindex?token=<admin_token>`

## 4) Notes

- Free LLM (Ollama) usually is not available on Railway shared environment.
  - In that case, `/api/rag/ask_llm` returns retrieval results with `llm_mode: "fallback"`.
- RAG index file is rebuilt automatically when needed.
