import pandas as pd
from pathlib import Path
from sentence_transformers import SentenceTransformer, util

# === НАСТРОЙКИ ===
IN_PATH = Path("data/train_pairs.csv")          # твой уже обрезанный train
OUT_PATH = Path("data/train_pairs_hardneg.csv")         # новый train
CONCEPTS_PATH = Path("data/concepts.txt")               # список концептов (по одному в строке)
BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

HARD_NEG_PER_TEXT = 4          # сколько hard-негативов добавлять на 1 текст
CANDIDATE_TOPK = 40            # из скольких ближайших концептов выбирать hard-негативы
RANDOM_SEED = 42


def main():
    df = pd.read_csv(IN_PATH)

    # Считываем список концептов
    concepts = [c.strip() for c in CONCEPTS_PATH.read_text(encoding="utf-8").splitlines() if c.strip()]
    concept_set = set(concepts)

    # Проверка: все ли концепты из train существуют в списке
    missing = sorted(set(df["concept"]) - concept_set)
    if missing:
        print("WARNING: concepts missing in concepts.txt (first 20):", missing[:20])

    # Загружаем базовую модель (лучше базовую, чтобы не подглядывать в finetuned)
    model = SentenceTransformer(BASE_MODEL)

    # Векторизуем все концепты один раз
    concept_emb = model.encode(concepts, normalize_embeddings=True, batch_size=64, show_progress_bar=True)

    # Соберём позитивы по каждому тексту
    pos = df[df["label"] == 1].groupby("annotation")["concept"].apply(set).to_dict()

    # И все существующие негативы (чтобы не дублировать)
    existing_pairs = set(zip(df["annotation"], df["concept"], df["label"]))

    new_rows = []
    annotations = list(pos.keys())

    # Векторизуем тексты (аннотации)
    text_emb = model.encode(annotations, normalize_embeddings=True, batch_size=16, show_progress_bar=True)

    # Для каждого текста ищем ближайшие концепты
    for ann, emb in zip(annotations, text_emb):
        # cosine similarity к каждому концепту
        scores = util.cos_sim(emb, concept_emb)[0]  # shape: [num_concepts]
        topk = int(min(CANDIDATE_TOPK, len(concepts)))
        # индексы top-k
        top_idx = scores.topk(k=topk).indices.tolist()

        pos_concepts = pos[ann]
        added = 0

        for idx in top_idx:
            c = concepts[idx]
            if c in pos_concepts:
                continue  # это позитив
            # если уже есть такая пара в датасете как 0/1 — не добавляем
            if (ann, c, 0) in existing_pairs or (ann, c, 1) in existing_pairs:
                continue

            new_rows.append({"annotation": ann, "concept": c, "label": 0})
            added += 1
            if added >= HARD_NEG_PER_TEXT:
                break

    df_aug = pd.concat([df, pd.DataFrame(new_rows)], ignore_index=True)
    df_aug = df_aug.sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df_aug.to_csv(OUT_PATH, index=False)

    print("Saved:", OUT_PATH)
    print("Rows before:", len(df), "after:", len(df_aug))
    print("Added hard negatives:", len(new_rows))


if __name__ == "__main__":
    main()
