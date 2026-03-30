import csv
from pathlib import Path
import numpy as np
from sentence_transformers import SentenceTransformer


def load_concepts(path: Path) -> list[str]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if t and not t.startswith("#"):
            items.append(t)
    if not items:
        raise ValueError("concepts.txt пустой")
    return items


def cosine_topk(text_emb: np.ndarray, concept_emb: np.ndarray, concepts: list[str], k: int):
    sims = concept_emb @ text_emb  # cosine sim (если normalize_embeddings=True)
    idx = np.argsort(-sims)[:k]
    return [concepts[i] for i in idx]


def metrics(rows, concepts, concept_emb, model, ks=(1, 3, 5, 10)):
    hits = {k: 0 for k in ks}
    rr_sum = 0.0

    for text, true_concept in rows:
        emb = model.encode([text], normalize_embeddings=True)[0]
        sims = concept_emb @ emb
        order = np.argsort(-sims)

        ranked = [concepts[i] for i in order]

        # Recall@K
        for k in ks:
            if true_concept in ranked[:k]:
                hits[k] += 1

        # MRR
        try:
            rank = ranked.index(true_concept) + 1
            rr_sum += 1.0 / rank
        except ValueError:
            rr_sum += 0.0

    n = len(rows)
    out = {f"recall@{k}": hits[k] / n for k in ks}
    out["mrr"] = rr_sum / n
    out["n"] = n
    return out


def read_eval_csv(path: Path):
    rows = []
    with path.open("r", encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        if "text" not in r.fieldnames or "concept" not in r.fieldnames:
            raise ValueError("eval_pairs.csv должен иметь колонки: text, concept")
        for row in r:
            text = (row.get("text") or "").strip()
            concept = (row.get("concept") or "").strip()
            if text and concept:
                rows.append((text, concept))
    if not rows:
        raise ValueError("eval_pairs.csv пустой")
    return rows


def main():
    data_dir = Path(__file__).resolve().parents[1] / "data"
    concepts_path = data_dir / "concepts.txt"
    eval_path = data_dir / "eval_pairs.csv"
    finetuned_path = data_dir / "sbert_finetuned"

    concepts = load_concepts(concepts_path)
    rows = read_eval_csv(eval_path)

    base_name = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    ft_name = str(finetuned_path) if finetuned_path.exists() else None

    base_model = SentenceTransformer(base_name)
    ft_model = SentenceTransformer(ft_name) if ft_name else None

    # ВАЖНО: концепты эмбеддим отдельно для каждой модели!
    base_concept_emb = base_model.encode(concepts, normalize_embeddings=True, batch_size=64)
    base_res = metrics(rows, concepts, base_concept_emb, base_model)

    print("\nBASE:", base_name)
    print(base_res)

    if ft_model:
        ft_concept_emb = ft_model.encode(concepts, normalize_embeddings=True, batch_size=64)
        ft_res = metrics(rows, concepts, ft_concept_emb, ft_model)

        print("\nFINETUNED:", ft_name)
        print(ft_res)

    else:
        print("\nFINETUNED model not found at:", finetuned_path)


if __name__ == "__main__":
    main()
