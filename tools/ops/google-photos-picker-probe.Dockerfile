# Operator-only temporary Google Photos Picker probe. Not part of eimir. Cloud/production.
# IMPORTANT: build with the restricted `scripts/` directory as Docker context,
# never the repository root (which may hold operator environment files).
FROM python:3.14.8-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN python -m pip install --no-cache-dir "google-auth-oauthlib==1.5.0"

WORKDIR /opt/eimir-photos-probe
COPY --chown=10001:10001 google_photos_picker_probe.py google_photos_picker_web_probe.py ./scripts/

# Keep both code and private mounted credentials inaccessible to other users.
# Bind the operator-only OAuth JSON with read permission for UID/GID 10001.
USER 10001:10001
CMD ["python", "scripts/google_photos_picker_web_probe.py", "--port", "8787"]
