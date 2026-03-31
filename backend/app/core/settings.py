from pydantic import BaseModel
import os
from pathlib import Path



class Settings(BaseModel):
    # API
    # cors_origins: list[str] = os.getenv(
    #     "CORS_ORIGINS",
    #     "http://localhost:5173,http://127.0.0.1:5173,https://reading-platform-iota.vercel.app"
    # ).split(",")

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://reading-platform-iota.vercel.app",
        "https://reading-platform-bq4mrb...vercel.app"
    ]
    
    # Auth / JWT
    jwt_secret: str = os.getenv("JWT_SECRET", "CHANGE_ME_PLEASE")
    # Neo4j
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:17687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "neo4j12345")

    # SBERT
    sbert_model_name: str = os.getenv(
        "SBERT_MODEL_NAME",
        # str((Path(__file__).resolve().parents[2] / "data" / "sbert_finetuned")),
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    )


    # Admin
    admin_emails: list[str] = [
        "admin@test.ru",      # основной администратор
        # "teacher@test.ru",  # можно добавить потом
    ]


settings = Settings()
