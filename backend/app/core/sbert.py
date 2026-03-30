from sentence_transformers import SentenceTransformer
from .settings import settings

_model: SentenceTransformer | None = None


def get_sbert() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.sbert_model_name)
    return _model
