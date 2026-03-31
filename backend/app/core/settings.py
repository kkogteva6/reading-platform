from pydantic import BaseModel
import os


def parse_origins(value: str) -> list[str]:
    """
    Разбивает строку CORS_ORIGINS и убирает пробелы.
    Это важно, иначе CORS может ломаться.
    """
    return [x.strip() for x in value.split(",") if x.strip()]


class Settings(BaseModel):
    # -----------------------------
    # CORS
    # -----------------------------
    cors_origins: list[str] = parse_origins(
        os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,"
            "http://127.0.0.1:5173,"
            "https://reading-platform-iota.vercel.app,"
            "https://reading-platform-bq4mrbcov-kkogteva6s-projects.vercel.app"
        )
    )

    # -----------------------------
    # JWT
    # -----------------------------
    jwt_secret: str = os.getenv("JWT_SECRET", "CHANGE_ME_PLEASE")

    # -----------------------------
    # Neo4j
    # -----------------------------
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:17687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "neo4j12345")

    # -----------------------------
    # SBERT
    # -----------------------------
    sbert_model_name: str = os.getenv(
        "SBERT_MODEL_NAME",
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    )

    # -----------------------------
    # Admin
    # -----------------------------
    admin_emails: list[str] = [
        "admin@test.ru",
    ]


settings = Settings()