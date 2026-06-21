"""إعدادات التطبيق — تُقرأ من متغيرات البيئة / ملف .env (لا أسرار في الكود)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # طبقة الذكاء (خلف تجريد المزوّد)
    llm_provider: str = "ollama"
    llm_model: str = "qwen2.5:14b"
    ollama_base_url: str = "http://localhost:11434"
    llm_temperature: float = 0.2
    llm_timeout: int = 300

    # توليد الاستمارات
    max_repairs: int = 2

    # الشبكة (المنافذ المحجوزة لـ Safi)
    api_port: int = 8601
    web_origin: str = "http://localhost:3601"

    # قاعدة البيانات (Postgres محلي)
    database_url: str = "postgresql+asyncpg://localhost:5432/safi"

    # المصادقة (JWT) — الأسرار من البيئة (لا أسرار في الكود)
    jwt_secret: str = ""              # عيّنه في .env للإنتاج؛ إن فرغ يُولَّد لكل تشغيل (تطوير)
    jwt_expire_minutes: int = 720     # صلاحية الرمز (12 ساعة)
    # حساب المسؤول الأولي (bootstrap) — dev فقط، غيّره عبر البيئة في الإنتاج
    admin_username: str = "admin"
    admin_password: str = "admin"


settings = Settings()
