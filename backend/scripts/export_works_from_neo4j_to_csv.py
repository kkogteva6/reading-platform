# backend/scripts/export_works_from_neo4j_to_csv.py
from pathlib import Path
import csv
import sys

# чтобы работал импорт app.*
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.neo4j import get_driver  # noqa: E402

DATA_DIR = ROOT / "data"
CSV_PATH = DATA_DIR / "input_books.csv"


QUERY = """
MATCH (w:Work)
OPTIONAL MATCH (w)-[:HAS_CONCEPT]->(c:Concept)
WITH w, collect(DISTINCT c.name) AS concept_names
RETURN
  w.id AS id,
  w.title AS title,
  w.author AS author,
  coalesce(w.age, '12+') AS age,
  coalesce(w.annotation, '') AS annotation,
  coalesce(w.cover_image, '') AS cover_image,
  concept_names
ORDER BY title
"""


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    driver = get_driver()
    rows: list[dict] = []

    with driver.session() as session:
        result = session.run(QUERY)
        for r in result:
            annotation = (r.get("annotation") or "").strip()

            # если аннотации нет, можно подставить концепты как временную подсказку
            if not annotation:
                concepts = [x for x in (r.get("concept_names") or []) if x]
                if concepts:
                    annotation = "Концепты: " + ", ".join(concepts[:12])

            rows.append(
                {
                    "id": (r.get("id") or "").strip(),
                    "title": (r.get("title") or "").strip(),
                    "author": (r.get("author") or "").strip(),
                    "age": (r.get("age") or "12+").strip() or "12+",
                    "annotation": annotation,
                    "cover_image": (r.get("cover_image") or "").strip(),
                }
            )

    # выкидываем совсем пустые/битые строки
    cleaned = []
    seen_ids = set()
    for row in rows:
        if not row["id"] or not row["title"] or not row["author"]:
            continue
        if row["id"] in seen_ids:
            continue
        seen_ids.add(row["id"])
        cleaned.append(row)

    with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["id", "title", "author", "age", "annotation", "cover_image"],
        )
        writer.writeheader()
        writer.writerows(cleaned)

    print(f"Exported {len(cleaned)} books to {CSV_PATH}")


if __name__ == "__main__":
    main()