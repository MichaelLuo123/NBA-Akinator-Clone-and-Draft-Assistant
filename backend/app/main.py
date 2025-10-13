from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from .logic import (
    build_candidates_from_csv,
    choose_best_question,
    apply_answer_filter,
    guess_top_candidate,
    train_decision_tree,
    infer_with_tree,
)

app = FastAPI(title="NBA Akinator Backend", version="0.1.0")
USE_TREE = True
TREE = None


@app.on_event("startup")
def _train_tree_on_startup() -> None:
    global TREE
    try:
        candidates = build_candidates_from_csv()
        TREE = train_decision_tree(candidates, max_depth=6)
    except Exception:
        TREE = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QA(BaseModel):
    question: str
    answer: bool


class NextQuestionRequest(BaseModel):
    asked: List[QA] = []
    candidate_ids: Optional[List[str]] = None


class NextQuestionResponse(BaseModel):
    question: str
    meta: Dict[str, Any]
    remaining: int


class GuessRequest(BaseModel):
    asked: List[QA] = []
    candidate_ids: Optional[List[str]] = None


class GuessResponse(BaseModel):
    player_id: str
    full_name: str
    confidence: float


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/players")
def players() -> List[Dict[str, Any]]:
    candidates = build_candidates_from_csv()
    return candidates


@app.post("/next-question", response_model=NextQuestionResponse)
def next_question(req: NextQuestionRequest):
    candidates = build_candidates_from_csv()

    if req.candidate_ids:
        idset = set(req.candidate_ids)
        candidates = [c for c in candidates if str(c.get("id", c.get("full_name"))) in idset]

    for qa in req.asked:
        candidates = apply_answer_filter(candidates, qa.question, qa.answer)

    if len(candidates) == 0:
        raise HTTPException(status_code=400, detail="No candidates remain after filters")

    # If a tree is available, try to follow it first
    if USE_TREE and TREE is not None:
        node = infer_with_tree(TREE, [(qa.question, qa.answer) for qa in req.asked])
        if isinstance(node, dict) and node.get("type") == "node":
            return NextQuestionResponse(question=node["question"], meta=node.get("meta", {}), remaining=len(candidates))

    question, meta = choose_best_question(candidates)

    return NextQuestionResponse(question=question, meta=meta, remaining=len(candidates))


@app.post("/guess", response_model=GuessResponse)
def guess(req: GuessRequest):
    candidates = build_candidates_from_csv()
    if req.candidate_ids:
        idset = set(req.candidate_ids)
        candidates = [c for c in candidates if str(c.get("id", c.get("full_name"))) in idset]

    for qa in req.asked:
        candidates = apply_answer_filter(candidates, qa.question, qa.answer)

    if len(candidates) == 0:
        raise HTTPException(status_code=400, detail="No candidates remain after filters")

    # If tree leads to a leaf with candidates, pick the top within that leaf
    if USE_TREE and TREE is not None:
        node = infer_with_tree(TREE, [(qa.question, qa.answer) for qa in req.asked])
        if isinstance(node, dict) and node.get("type") == "leaf":
            leaf_cands = node.get("candidates", [])
            if leaf_cands:
                # Filter with remaining candidates intersection
                idset = {str(c.get("id", c.get("full_name"))) for c in candidates}
                leaf_filtered = [c for c in leaf_cands if str(c.get("id", c.get("full_name"))) in idset]
                if leaf_filtered:
                    candidates = leaf_filtered

    top = guess_top_candidate(candidates)
    return GuessResponse(player_id=str(top.get("id", top.get("full_name"))), full_name=top["full_name"], confidence=top.get("confidence", 1.0))


