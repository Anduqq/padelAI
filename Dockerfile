FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

COPY frontend/package.json ./
COPY frontend/ ./
RUN npm install
RUN npm run test
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY backend /app/backend
COPY --from=frontend-builder /build/frontend/dist /app/backend/app/static

WORKDIR /app/backend

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
