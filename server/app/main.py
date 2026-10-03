"""FastAPI app factory.

Phase 1 scaffold: config, CORS (dev), GZip and a health/status endpoint. Routers for auth, claims,
pipeline, etc. are added from Phase 2 onward (spec §17).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .config import get_settings, log_startup_state
from .routers.auth import router as auth_router
from .routers.claims import router as claims_router
from .routers.filing import router as filing_router
from .routers.stats import router as stats_router
from .routers.notifications import router as notifications_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log_startup_state(get_settings())
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(auth_router)
    app.include_router(claims_router)
    app.include_router(filing_router)
    app.include_router(stats_router)
    app.include_router(notifications_router)

    @app.get("/api/system/status")
    async def system_status() -> dict:
        """Health + LLM mode (never exposes secrets or the project id)."""
        s = get_settings()
        return {
            "status": "ok",
            "app_name": s.app_name,
            "insurer_name": s.insurer_name,
            "demo_mode": s.demo_mode,
            "llm_mode": s.effective_llm_mode,
            "credentials_present": s.credentials_present,
            "model": s.gemini_model,
        }

    return app


app = create_app()
