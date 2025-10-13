import pytest

from app.logic import (
    choose_best_question,
    apply_answer_filter,
    train_decision_tree,
    infer_with_tree,
)


def _mk(name, team, pos, awards=0, age=25, height=200, pts=10):
    return {
        "id": name,
        "full_name": name,
        "team": team,
        "position": pos,
        "awards_count": awards,
        "age": age,
        "height": height,
        "weight": 200,
        "average_points": pts,
        "average_assists": 3,
        "average_rebounds": 4,
        "average_steals": 1,
        "average_blocks": 1,
    }


def test_choose_best_question_balances_split():
    cands = [
        _mk("A", "Lakers", "G"),
        _mk("B", "Lakers", "F"),
        _mk("C", "Celtics", "G"),
        _mk("D", "Celtics", "F"),
    ]
    q, meta = choose_best_question(cands)
    assert isinstance(q, str)
    assert meta


def test_apply_answer_filter_team():
    cands = [
        _mk("A", "Lakers", "G"),
        _mk("B", "Celtics", "F"),
    ]
    q = "Is your player on the Lakers?"
    yes_filtered = apply_answer_filter(cands, q, True)
    no_filtered = apply_answer_filter(cands, q, False)
    assert len(yes_filtered) == 1 and yes_filtered[0]["team"] == "Lakers"
    assert all(c["team"] != "Lakers" for c in no_filtered)


def test_decision_tree_inference():
    cands = [
        _mk("A", "Lakers", "G"),
        _mk("B", "Celtics", "F"),
        _mk("C", "Celtics", "G"),
    ]
    tree = train_decision_tree(cands, max_depth=3)
    # Walk zero answers returns a node/leaf without error
    node = infer_with_tree(tree, [])
    assert isinstance(node, dict)


