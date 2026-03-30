import csv
from pathlib import Path
from typing import List, Tuple

from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader


def load_pairs_csv(path: Path) -> List[InputExample]:
    items: List[InputExample] = []
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        need = {"annotation", "concept", "label"}
        missing = need - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"В CSV не хватает колонок: {sorted(missing)}")

        for row in reader:
            ann = (row.get("annotation") or "").strip()
            concept = (row.get("concept") or "").strip()
            label_str = (row.get("label") or "").strip()

            if not ann or not concept or label_str == "":
                continue

            label = float(label_str)
            # sentence-transformers ожидает float label для CosineSimilarityLoss
            items.append(InputExample(texts=[ann, concept], label=label))

    if not items:
        raise ValueError("В train_pairs.csv нет валидных строк")
    return items


def main():
    root = Path(__file__).resolve().parents[1]  # backend/
    data_dir = root / "data"
    train_path = data_dir / "train_pairs_hardneg.csv"
    out_dir = data_dir / "sbert_finetuned"

    if not train_path.exists():
        raise FileNotFoundError(f"Нет файла: {train_path}")

    # базовая модель как в build_works_from_csv_sbert.py
    base_model = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    model = SentenceTransformer(base_model)

    train_samples = load_pairs_csv(train_path)
    train_loader = DataLoader(train_samples, shuffle=True, batch_size=16)

    # простой и стабильный loss для "похоже/не похоже"
    train_loss = losses.CosineSimilarityLoss(model)

    epochs = 4
    warmup_steps = max(1, int(len(train_loader) * epochs * 0.1))

    model.fit(
        train_objectives=[(train_loader, train_loss)],
        epochs=epochs,
        warmup_steps=warmup_steps,
        show_progress_bar=True,
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    model.save(str(out_dir))

    print(f"OK: saved finetuned model to {out_dir}")


if __name__ == "__main__":
    main()
