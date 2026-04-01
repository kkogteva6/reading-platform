from typing import List
from ..schemas import Work
from ..core.neo4j import get_driver
from ..core.settings import settings


def get_works_from_neo4j() -> List[Work]:
    query = """
    MATCH (w:Work)
    OPTIONAL MATCH (w)-[r:HAS_CONCEPT]->(c:Concept)
    RETURN
      w.id AS id,
      w.title AS title,
      w.author AS author,
      w.age AS age,
      w.cover_image AS cover_image,
      w.annotation AS annotation,
      collect({name: c.name, weight: r.weight}) AS concepts
    ORDER BY w.title
    """
    works: List[Work] = []
    driver = get_driver()

    with driver.session(database=settings.neo4j_database) as session:
        for rec in session.run(query):
            concepts_dict = {
                item["name"]: float(item["weight"])
                for item in rec["concepts"]
                if item["name"] is not None and item["weight"] is not None
            }

            works.append(
                Work(
                    id=rec["id"],
                    title=rec["title"],
                    author=rec["author"],
                    age=rec["age"],
                    concepts=concepts_dict,
                    cover_image=rec.get("cover_image"),
                    annotation=rec.get("annotation"),
                )
            )

    return works
