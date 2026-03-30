import numpy as np
from typing import Dict
from ..core.sbert import get_sbert
from .targets import CONCEPT_ANCHORS


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = a / (np.linalg.norm(a) + 1e-12)
    b = b / (np.linalg.norm(b) + 1e-12)
    return float(np.dot(a, b))


def analyze_text_to_concepts(text: str) -> Dict[str, float]:
    """
    Возвращает {concept: 0..1}
    Перенеси сюда твою текущую логику anchors → embedding → similarity → normalization.
    """
    sbert = get_sbert()

    text_emb = sbert.encode([text], normalize_embeddings=True)[0]
    out: Dict[str, float] = {}

    for concept, anchors in CONCEPT_ANCHORS.items():
        anchor_emb = sbert.encode(anchors, normalize_embeddings=True)
        mean_anchor = np.mean(anchor_emb, axis=0)
        score = cosine(text_emb, mean_anchor)

        # Нормализацию/клиппинг перенеси 1:1 из main.py
        out[concept] = max(0.0, min(1.0, (score + 1) / 2))

    return out
