"""نقطة دخول Safi API (FastAPI)."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.auth_routes import router as auth_router
from .api.lookup_routes import router as lookup_router
from .api.routes import router as forms_router
from .api.store_routes import router as store_router
from .api.user_routes import router as user_router
from .config import settings
from .db.seed import seed_auth, seed_lookups
from .db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # إنشاء الجداول + البذور (idempotent): البيانات الساندة + الأدوار والمسؤول الأولي
    await init_db()
    await seed_lookups()
    await seed_auth()
    yield


app = FastAPI(title="Safi API", version="0.1.0", lifespan=lifespan)

# CORS للتطوير المحلي (يُضيَّق في الإنتاج)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)    # /auth (تسجيل/دخول/المستخدم الحالي)
app.include_router(user_router)    # /users, /roles (إدارة — users:manage)
app.include_router(forms_router)   # /forms/generate
app.include_router(store_router)   # /forms (حفظ/استرجاع) + /forms/{id}/submissions
app.include_router(lookup_router)  # /lookups (البيانات الساندة + الإسناد)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "provider": settings.llm_provider, "model": settings.llm_model}
