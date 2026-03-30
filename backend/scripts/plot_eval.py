import subprocess
import json
from pathlib import Path
import re
import matplotlib.pyplot as plt
import sys

def parse_dict(line: str):
    # ожидаем строку вида: {'recall@1': 0.3, ...}
    m = re.search(r"\{.*\}", line)
    if not m:
        return None
    s = m.group(0).replace("'", '"')
    return json.loads(s)


def main():
    # запускаем eval и парсим вывод
    p = subprocess.run(
        [sys.executable, "scripts/eval_sbert_concepts.py"],
        capture_output=True,
        text=True,
    )
    print(p.stdout)
    if p.returncode != 0:
        print(p.stderr)
        raise SystemExit(1)

    lines = [l.strip() for l in p.stdout.splitlines() if l.strip()]
    base = None
    ft = None
    for i, l in enumerate(lines):
        if l.startswith("BASE:"):
            base = parse_dict(lines[i + 1]) if i + 1 < len(lines) else None
        if l.startswith("FINETUNED:"):
            ft = parse_dict(lines[i + 1]) if i + 1 < len(lines) else None

    if not base:
        raise SystemExit("Не смог распарсить BASE метрики")
    if not ft:
        raise SystemExit("Не смог распарсить FINETUNED метрики (нет модели или не распарсилось)")

    keys = ["recall@1", "recall@3", "recall@5", "recall@10", "mrr"]
    base_vals = [base[k] for k in keys]
    ft_vals = [ft[k] for k in keys]

    x = list(range(len(keys)))
    w = 0.35

    plt.figure()
    plt.bar([i - w/2 for i in x], base_vals, width=w, label="Базовая модель")
    plt.bar([i + w/2 for i in x], ft_vals, width=w, label="Дообученная модель")
    plt.xticks(x, keys, rotation=0)
    plt.ylim(0, 1)
    plt.legend()
    plt.title("Сравнение базовой и дообученной моделей")

    out = Path("data/eval_plot.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(out, dpi=160, bbox_inches="tight")

    print("Saved:", out)


if __name__ == "__main__":
    main()
