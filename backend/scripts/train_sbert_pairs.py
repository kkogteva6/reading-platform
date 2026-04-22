import csv
from pathlib import Path
from typing import List, Tuple

# Импорт модели SBERT и вспомогательных классов
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader # помогает разбивать данные на батчи

# Загрузка обучающих данных из CSV
def load_pairs_csv(path: Path) -> List[InputExample]:
    # список, куда будем складывать все примеры
    items: List[InputExample] = []
    
    # открываем файл
    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        # проверяем, что в файле есть нужные колонки: текст, концепт, насколько они связаны
        need = {"annotation", "concept", "label"}
        missing = need - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"В CSV не хватает колонок: {sorted(missing)}")

        # проходим по каждой строке CSV
        for row in reader:
            # берём текст
            ann = (row.get("annotation") or "").strip()
            # берём концепт
            concept = (row.get("concept") or "").strip()
            # берём метку (0 или 1)
            label_str = (row.get("label") or "").strip()

            # если что-то пустое, пропускаем
            if not ann or not concept or label_str == "":
                continue

            # превращаем строку в число
            label = float(label_str)
            # создаём объект InputExample: texts=[текст,концепт], label-насколько они похожи
            items.append(InputExample(texts=[ann, concept], label=label))

    # если ничего не загрузилось, ошибка
    if not items:
        raise ValueError("В train_pairs.csv нет валидных строк")
    return items


# Запуск обучения
def main():
    # путь к папке backend/
    root = Path(__file__).resolve().parents[1]  
    # папка с данными
    data_dir = root / "data"
    # файл с обучающими парами
    train_path = data_dir / "train_pairs_hardneg.csv"
    # папка для сохранения обученной модели
    out_dir = data_dir / "sbert_finetuned"

    # проверка, что файл существует
    if not train_path.exists():
        raise FileNotFoundError(f"Нет файла: {train_path}")

    # Загружаем базовую модель SBERT
    base_model = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    model = SentenceTransformer(base_model)

    # Загружаем обучающие данные
    train_samples = load_pairs_csv(train_path)
    # Разбиваем данные на батчи (по 16 примеров)
    train_loader = DataLoader(train_samples, shuffle=True, batch_size=16)

    # Функция потерь (учит модель говорить, похожи эти тексты или нет) 
    train_loss = losses.CosineSimilarityLoss(model)

    # Параметры обучения
    epochs = 4      # сколько раз пройтись по данным
    # постепенный разгон обучения
    warmup_steps = max(1, int(len(train_loader) * epochs * 0.1))

    # Запуск обучения
    model.fit(
        train_objectives=[(train_loader, train_loss)],
        epochs=epochs,
        warmup_steps=warmup_steps,
        show_progress_bar=True,
    )

    # Сохраняем модель
    out_dir.mkdir(parents=True, exist_ok=True) # создаём папку, если её нет
    model.save(str(out_dir)) # сохраняем модель на диск
    print(f"OK: saved finetuned model to {out_dir}")

if __name__ == "__main__":
    main()
