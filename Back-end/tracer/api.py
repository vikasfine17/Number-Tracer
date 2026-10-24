"""Run with: uvicorn tracer.api:app --port 8000"""
import os
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .pipeline import get_sources, trace

app = FastAPI(title="Number Tracer")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
                   allow_methods=["*"], allow_headers=["*"])


class TraceReq(BaseModel):
    text: str
    provider: Optional[str] = None   # "ollama" or "gemini"


@app.post("/trace")
def trace_route(r: TraceReq):
    return trace(r.text, r.provider)


@app.get("/sources")
def sources():
    return [s.name for s in get_sources()]


@app.get("/health")
def health():
    return {"ok": True, "provider": os.getenv("TRACER_PROVIDER", "ollama"),
            "model": os.getenv("TRACER_MODEL", "gemma4"), "gemini_key_set": bool(os.getenv("GEMINI_API_KEY"))}
