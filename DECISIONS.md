# Decisions & Performance Log

This log records technical decisions, simplifications, and benchmark measurements as required by the specification.

## Architectural & Library Decisions
- Initialized monorepo with `engine` (FastAPI + uv) and `web` (Next.js 16 + React 19 + Tailwind v4 + shadcn/ui).
- In `engine/pyproject.toml`, configured `package = false` under `[tool.uv]` to run as a direct application with `uv run uvicorn app.main:app`.
- Configured pytest `pythonpath = ["."]` in `engine/pyproject.toml` for standard module discovery.
