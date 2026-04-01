import json
from pathlib import Path
from neo4j import GraphDatabase
import os

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://127.0.0.1:17687")
NEO4J_USER = os.getenv("NEO4J_USER") or os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "neo4j12345")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE", "neo4j")


def main():
    print("RUNNING IMPORT FILE:", __file__)

    data_path = Path(__file__).resolve().parents[1] / "data" / "works.json"
    works = json.loads(data_path.read_text(encoding="utf-8"))

    driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASS))

    work_cypher = """
    MERGE (w:Work {id: $id})
    SET w.title = $title,
        w.author = $author,
        w.age = $age,
        w.cover_image = $cover_image,
        w.annotation = $annotation
    RETURN w
    """

    concept_cypher = """
    MATCH (w:Work {id: $work_id})
    MERGE (c:Concept {name: $concept_name})
    MERGE (w)-[r:HAS_CONCEPT]->(c)
    SET r.weight = $weight
    RETURN c.name, r.weight
    """

    with driver.session(database=NEO4J_DATABASE) as session:
        for w in works:
            session.run(
                work_cypher,
                id=w["id"],
                title=w.get("title", ""),
                author=w.get("author", ""),
                age=w.get("age", "12+"),
                cover_image=w.get("cover_image"),
                annotation=w.get("annotation"),
            )

            concepts = w.get("concepts", {}) or {}
            for concept_name, weight in concepts.items():
                try:
                    weight_num = float(weight)
                except Exception:
                    continue

                if weight_num <= 0:
                    continue

                session.run(
                    concept_cypher,
                    work_id=w["id"],
                    concept_name=concept_name,
                    weight=weight_num,
                )

    driver.close()
    print(f"OK: imported works={len(works)} from {data_path}")


if __name__ == "__main__":
    main()
