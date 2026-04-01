from typing import Any

from .settings import settings

_model: Any | None = None


def get_sbert() -> Any:
    global _model
    if _model is None:
        # Import lazily so app startup on Render does not pull the whole
        # transformers/torch stack before the HTTP port is bound.
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(settings.sbert_model_name)
    return _model
