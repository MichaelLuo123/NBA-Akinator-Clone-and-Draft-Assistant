import csv
import math
import os
from typing import Any, Dict, List, Optional, Tuple, Callable, Union


def _infer_conference(team: str) -> str:
    east = {
        "Celtics","Knicks","Nets","76ers","Raptors","Bucks","Bulls","Cavaliers","Pistons","Pacers",
        "Hawks","Heat","Hornets","Magic","Wizards",
    }
    west = {
        "Lakers","Clippers","Warriors","Kings","Suns","Mavericks","Spurs","Rockets","Grizzlies",
        "Pelicans","Thunder","Trail Blazers","Timberwolves","Nuggets","Jazz",
    }
    if team in east:
        return "east"
    if team in west:
        return "west"
    return "east"


def _clean_position(pos: str) -> str:
    if not pos:
        return "F"
    pos = str(pos)
    mapping = {
        "Center-Forward": "F-C",
        "Forward-Center": "F-C",
        "Guard-Forward": "G-F",
        "Forward": "F",
        "Guard": "G",
        "Center": "C",
    }
    return mapping.get(pos, pos)


def _candidate_file_paths() -> List[str]:
    return [
        os.path.join("my-project", "data", "merged_player_data.csv"),
        os.path.join("data", "merged_player_data.csv"),
        os.path.join("my-project", "public", "merged_player_data.csv"),
        os.path.join("public", "merged_player_data.csv"),
    ]


def build_candidates_from_csv() -> List[Dict[str, Any]]:
    path: Optional[str] = None
    for p in _candidate_file_paths():
        if os.path.exists(p):
            path = p
            break
    if not path:
        raise FileNotFoundError("merged_player_data.csv not found in expected paths")

    candidates: List[Dict[str, Any]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            try:
                team = row.get("team", "")
                position = _clean_position(row.get("position", "F"))
                candidate = {
                    "id": row.get("id", idx),
                    "full_name": row.get("full_name", "Unknown"),
                    "team": team,
                    "position": position,
                    "conference": _infer_conference(team),
                    "height": float(row.get("height", 0) or 0),
                    "weight": float(row.get("weight", 0) or 0),
                    "age": int(float(row.get("age", 0) or 0)),
                    "average_points": float(row.get("average_points", 0) or 0),
                    "average_assists": float(row.get("average_assists", 0) or 0),
                    "average_rebounds": float(row.get("average_rebounds", 0) or 0),
                    "average_steals": float(row.get("average_steals", 0) or 0),
                    "average_blocks": float(row.get("average_blocks", 0) or 0),
                    "awards_count": int(float(row.get("awards_count", 0) or 0)),
                }
                candidates.append(candidate)
            except Exception:
                continue
    return candidates


def _entropy(p: int, n: int) -> float:
    total = p + n
    if total == 0:
        return 0.0
    h = 0.0
    for c in (p, n):
        if c == 0:
            continue
        prob = c / total
        h -= prob * math.log2(prob)
    return h


def _information_gain(total_size: int, left_size: int, right_size: int) -> float:
    # True entropy of split sizes (unsupervised proxy): H(parent) - sum_i p_i * H(child_i)
    # where parent entropy is computed from left/right proportions
    if total_size == 0:
        return 0.0
    parent_entropy = _entropy(left_size, right_size)
    left_entropy = _entropy(left_size, total_size - left_size)
    right_entropy = _entropy(right_size, total_size - right_size)
    weighted_child_entropy = 0.0
    if total_size:
        weighted_child_entropy = (left_size / total_size) * left_entropy + (right_size / total_size) * right_entropy
    return max(0.0, parent_entropy - weighted_child_entropy)


def _numeric_thresholds(values: List[float]) -> List[float]:
    uniq = sorted({v for v in values if v is not None})
    thresholds: List[float] = []
    for i in range(len(uniq) - 1):
        thresholds.append((uniq[i] + uniq[i + 1]) / 2)
    return thresholds


def _best_split(candidates: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any], Callable[[Dict[str, Any]], bool]]:
    if len(candidates) <= 5:
        names = ", ".join([c["full_name"] for c in candidates])
        return (f"Is your player one of these: {names}?", {"type": "list"}, lambda c: True)

    best_gain = -1.0
    best_tuple: Optional[Tuple[str, Dict[str, Any], Callable[[Dict[str, Any]], bool], int, int]] = None

    total = len(candidates)

    # Team equality questions
    teams = {c["team"] for c in candidates if c.get("team")}
    for team in teams:
        left = sum(1 for c in candidates if c.get("team") == team)
        right = total - left
        gain = _information_gain(total, left, right)
        if gain > best_gain:
            best_gain = gain
            best_tuple = (
                f"Is your player on the {team}?",
                {"type": "team", "value": team},
                (lambda t: (lambda c: c.get("team") == t))(team),
                left,
                right,
            )

    # Position buckets
    pos_buckets = [
        ("strictly a Guard", lambda c: c.get("position") == "G"),
        ("strictly a Forward", lambda c: c.get("position") == "F"),
        ("strictly a Center", lambda c: c.get("position") == "C"),
        ("a Guard-Forward (G-F) hybrid", lambda c: c.get("position") == "G-F"),
        ("a Forward-Center (F-C) hybrid", lambda c: c.get("position") == "F-C"),
    ]
    for phr, pred in pos_buckets:
        left = sum(1 for c in candidates if pred(c))
        right = total - left
        if left == 0 or right == 0:
            continue
        gain = _information_gain(total, left, right)
        if gain > best_gain:
            best_gain = gain
            best_tuple = (
                f"Is your player {phr}?",
                {"type": "position", "phrase": phr},
                pred,
                left,
                right,
            )

    # Awards > 0
    left = sum(1 for c in candidates if (c.get("awards_count", 0) or 0) > 0)
    right = total - left
    if left > 0 and right > 0:
        gain = _information_gain(total, left, right)
        if gain > best_gain:
            best_gain = gain
            best_tuple = (
                "Has your player received any awards?",
                {"type": "awards"},
                lambda c: (c.get("awards_count", 0) or 0) > 0,
                left,
                right,
            )

    # Numeric features
    numeric_cols = [
        "age",
        "height",
        "weight",
        "average_points",
        "average_assists",
        "average_rebounds",
        "average_steals",
        "average_blocks",
    ]
    for col in numeric_cols:
        values = [float(c.get(col)) for c in candidates if c.get(col) is not None]
        thresholds = _numeric_thresholds(values)
        for t in thresholds:
            left = sum(1 for c in candidates if float(c.get(col, 0.0)) <= t)
            right = total - left
            if left == 0 or right == 0:
                continue
            gain = _information_gain(total, left, right)
            if gain > best_gain:
                best_gain = gain
                if col == "height":
                    inches = t / 2.54
                    feet = int(inches // 12)
                    rem = int(round(inches % 12))
                    q = f"Is your player taller than {feet}'{rem}\"?"
                elif col == "age":
                    q = f"Is your player older than {int(t)} years?"
                elif col == "weight":
                    q = f"Is your player heavier than {int(t)} lbs?"
                else:
                    stat = col.replace("average_", "")
                    q = f"Does your player average more than {round(t, 1)} {stat}?"
                best_tuple = (
                    q,
                    {"type": "numeric", "col": col, "threshold": float(t)},
                    (lambda cc, th= float(t): (lambda c: float(c.get(cc, 0.0)) > th))(col),
                    right,  # yes branch size (value > threshold)
                    left,   # no branch size (<= threshold)
                )

    if best_tuple is None:
        # Fallback: list half of them
        names = ", ".join([c["full_name"] for c in candidates[: max(1, total // 2)]])
        return (f"Is your player one of these: {names}?", {"type": "list"}, lambda c: True)
    question, meta, predicate, _, _ = best_tuple
    return question, meta, predicate


def choose_best_question(candidates: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    q, meta, _ = _best_split(candidates)
    return q, meta


# -------- Decision Tree (minimal) --------

class DTNode(Dict[str, Any]):
    pass


def train_decision_tree(candidates: List[Dict[str, Any]], max_depth: int = 6) -> DTNode:
    # Stop if small leaf
    if len(candidates) <= 5 or max_depth <= 0:
        return DTNode({"type": "leaf", "candidates": candidates})

    question, meta, predicate = _best_split(candidates)
    # If the split is a list fallback, stop
    if meta.get("type") == "list":
        return DTNode({"type": "leaf", "candidates": candidates})

    yes_branch = [c for c in candidates if predicate(c)]
    no_branch = [c for c in candidates if not predicate(c)]

    # If ineffective split, stop
    if len(yes_branch) == 0 or len(no_branch) == 0:
        return DTNode({"type": "leaf", "candidates": candidates})

    return DTNode({
        "type": "node",
        "question": question,
        "meta": meta,
        "yes": train_decision_tree(yes_branch, max_depth - 1),
        "no": train_decision_tree(no_branch, max_depth - 1),
    })


def infer_with_tree(node: DTNode, asked: List[Tuple[str, bool]]) -> DTNode:
    # Traverse based on asked answers; if mismatch or at leaf, return current node
    cur = node
    for q, ans in asked:
        if not isinstance(cur, dict) or cur.get("type") != "node":
            break
        if cur.get("question") != q:
            break
        cur = cur.get("yes") if ans else cur.get("no")
    return cur


def apply_answer_filter(candidates: List[Dict[str, Any]], question: str, answer: bool) -> List[Dict[str, Any]]:
    res = candidates
    if question.startswith("Is your player one of these:"):
        names_str = question.replace("Is your player one of these: ", "").rstrip("?")
        names = [n.strip() for n in names_str.split(",")]
        if answer:
            res = [c for c in res if c.get("full_name") in names]
        else:
            res = [c for c in res if c.get("full_name") not in names]
        return res

    if question.startswith("Is your player on the "):
        team = question.replace("Is your player on the ", "").rstrip("?")
        if answer:
            res = [c for c in res if c.get("team") == team]
        else:
            res = [c for c in res if c.get("team") != team]
        return res

    if "strictly a Guard" in question:
        return [c for c in res if (c.get("position") == "G") == answer]
    if "strictly a Forward" in question:
        return [c for c in res if (c.get("position") == "F") == answer]
    if "strictly a Center" in question:
        return [c for c in res if (c.get("position") == "C") == answer]
    if "Guard-Forward" in question:
        return [c for c in res if (c.get("position") == "G-F") == answer]
    if "Forward-Center" in question:
        return [c for c in res if (c.get("position") == "F-C") == answer]

    if question.startswith("Has your player received any awards"):
        if answer:
            return [c for c in res if (c.get("awards_count", 0) or 0) > 0]
        return [c for c in res if (c.get("awards_count", 0) or 0) == 0]

    if "older than" in question:
        # Is your player older than N years?
        parts = question.split("older than ")[-1]
        n = int(parts.split(" ")[0])
        return [c for c in res if (c.get("age", 0) > n) == answer]

    if "taller than" in question:
        # Is your player taller than X'Y"?
        frag = question.split("taller than ")[-1].rstrip("?")
        feet = int(frag.split("'")[0])
        inches = int(frag.split("'")[1].replace('"', ''))
        cm = (feet * 12 + inches) * 2.54
        return [c for c in res if (float(c.get("height", 0)) > cm) == answer]

    if "heavier than" in question:
        n = int(question.split("heavier than ")[-1].split(" ")[0])
        return [c for c in res if (float(c.get("weight", 0)) > n) == answer]

    if "average more than" in question:
        # Does your player average more than V stat?
        tail = question.split("average more than ")[-1]
        value_str, stat = tail.split(" ")[:2]
        value = float(value_str)
        col = f"average_{stat}"
        return [c for c in res if (float(c.get(col, 0)) > value) == answer]

    return res


def guess_top_candidate(candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    # Simple heuristic: choose the candidate with the most awards, break ties by points
    sorted_cands = sorted(
        candidates,
        key=lambda c: (int(c.get("awards_count", 0) or 0), float(c.get("average_points", 0) or 0)),
        reverse=True,
    )
    top = sorted_cands[0]
    top["confidence"] = 1.0 if len(candidates) == 1 else max(0.5, 1.0 - math.log2(len(candidates)) / 10)
    return top


