from __future__ import annotations
from typing import Dict, Tuple
import math

def clamp01(x: float) -> float:
    return max(0.0, min(1.0, float(x)))

def merge_sources(
    last_test: Dict[str, float] | None,
    last_text: Dict[str, float] | None,
    text_count: int,
    test_count: int,
) -> Dict[str, float]:
    """
    Умная агрегация:
    - тест даёт стабильный "диагностический" сигнал (вес высокий после прохождения)
    - текст даёт поведенческий сигнал; доверие растёт с числом текстов
    """

    # Базовые веса (можно менять)
    base_test = 0.70 if test_count > 0 else 0.0
    # доверие к текстам растёт по логарифму: 1 текст ~0.25, 3 текста ~0.38, 10 текстов ~0.55
    text_trust = 0.18 + 0.22 * (1 - math.exp(-max(0, text_count) / 3.0))  # 0.18..0.40 примерно
    base_text = text_trust if text_count > 0 else 0.0

    # Нормируем так, чтобы сумма была <=1 (оставляя чуть "пустоты" для консервативности)
    s = base_test + base_text
    if s > 0.92:
        k = 0.92 / s
        base_test *= k
        base_text *= k

    out: Dict[str, float] = {}
    keys = set()
    if last_test: keys |= set(last_test.keys())
    if last_text: keys |= set(last_text.keys())

    for k in keys:
        t = clamp01(last_test.get(k, 0.0) if last_test else 0.0)
        x = clamp01(last_text.get(k, 0.0) if last_text else 0.0)
        out[k] = clamp01(base_test * t + base_text * x)
    return out
