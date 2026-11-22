FROM python:3.15.2-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928

ARG EIMIR_BUILD_REVISION=unverified-local-checkout

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_DEV=1 \
    UV_PYTHON_DOWNLOADS=0 \
    EIMIR_BUILD_REVISION="$EIMIR_BUILD_REVISION" \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN pip install --no-cache-dir "uv==0.12.15"

# Install only the locked runtime dependencies first. This keeps the expensive
# layer independent of application code, and uv must not modify the lock state.
# The Pro plugin is its own workspace distribution (Decision 0017, #2182); this
# image still ships it until the separate Core and Pro images exist.
COPY pyproject.toml uv.lock .python-version ./
COPY pro/pyproject.toml ./pro/
RUN uv sync --frozen --all-packages --no-install-workspace --no-editable

COPY src ./src
COPY pro/src ./pro/src
COPY demo_assets ./demo_assets
# Ship only the operational demo entrypoint, not the development/CI scripts.
COPY scripts/__init__.py scripts/demo_space.py ./scripts/
COPY alembic ./alembic
COPY alembic.ini ./

RUN uv sync --locked --all-packages --no-editable
# Keep the deployment-time demo bootstrap contract covered by every production
# image build without creating data or requiring demo credentials.
RUN python -m scripts.demo_space --help >/dev/null
RUN python -m scripts.demo_space validate-assets >/dev/null

# Do not run as root: a process escape must not immediately own the container.
RUN useradd --system --uid 10001 eimir \
    && mkdir -p /var/lib/eimir/media /var/lib/eimir/deletion-journal \
    && chown -R eimir /var/lib/eimir
USER eimir

EXPOSE 8000

CMD ["uvicorn", "eimir.main:app", "--host", "0.0.0.0", "--port", "8000"]
