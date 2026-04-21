FROM python:3.11-slim

WORKDIR /app

# Install deps first (layer caching)
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Non-root user
RUN adduser --disabled-password --gecos "" appuser

# Copy the backend package (preserves dir structure for relative imports)
COPY backend/ /app/backend/

USER appuser
EXPOSE 8001

# Run as a module so "backend" is the package — relative imports resolve
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8001"]
