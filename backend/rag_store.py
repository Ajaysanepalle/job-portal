from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlalchemy.orm import Session

import models


RAG_DIR = Path(__file__).resolve().parent / "rag_data"
RAG_DIR.mkdir(parents=True, exist_ok=True)
INDEX_PATH = RAG_DIR / "jobs_rag_index.joblib"

_lock = threading.Lock()


@dataclass(frozen=True)
class RagSuggestion:
    job_id: int
    score: float


def _job_to_text(job: models.Job) -> str:
    parts = [
        f"Job Title: {job.job_name or ''}",
        f"Company: {job.company or ''}",
        f"Location: {job.location or ''}",
        f"Experience: {job.eligible_years or ''}",
        f"Qualification: {job.qualification or ''}",
        f"Description: {job.job_description or ''}",
    ]
    return "\n".join(parts)


def _fetch_active_jobs(db: Session) -> list[models.Job]:
    return (
        db.query(models.Job)
        .filter(models.Job.is_active == True)  # noqa: E712
        .order_by(models.Job.created_at.desc())
        .all()
    )


def build_or_rebuild_index(db: Session) -> dict[str, Any]:
    jobs = _fetch_active_jobs(db)
    texts = [_job_to_text(j) for j in jobs]
    job_ids = [int(j.id) for j in jobs]

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 2),
        max_features=8000,
    )
    matrix = vectorizer.fit_transform(texts) if texts else None

    payload: dict[str, Any] = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "job_ids": job_ids,
        "vectorizer": vectorizer,
        "matrix": matrix,
    }

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(payload, INDEX_PATH)
    return payload


def load_index() -> dict[str, Any] | None:
    if not INDEX_PATH.exists():
        return None
    return joblib.load(INDEX_PATH)


def ensure_index(db: Session) -> dict[str, Any]:
    """
    Keep index persistent and avoid rebuilding on every request.
    Rebuild when missing, or when job count changed.
    """
    with _lock:
        idx = load_index()
        if idx is None:
            return build_or_rebuild_index(db)

        current_count = db.query(models.Job).filter(models.Job.is_active == True).count()  # noqa: E712
        indexed_count = len(idx.get("job_ids", []))
        if current_count != indexed_count:
            return build_or_rebuild_index(db)

        return idx


def query_jobs(db: Session, question: str, top_k: int = 5) -> list[RagSuggestion]:
    question = (question or "").strip()
    if not question:
        return []

    idx = ensure_index(db)
    job_ids: list[int] = list(idx.get("job_ids") or [])
    vectorizer: TfidfVectorizer = idx["vectorizer"]
    matrix = idx.get("matrix")

    if not job_ids or matrix is None:
        return []

    q_vec = vectorizer.transform([question])
    # cosine similarity for tf-idf is dot product when vectors are L2-normalized;
    # scikit-learn's TF-IDF does L2-normalize by default.
    scores = (matrix @ q_vec.T).toarray().reshape(-1)
    if scores.size == 0:
        return []

    k = max(1, min(int(top_k or 5), 20))
    top_idx = np.argsort(-scores)[:k]
    suggestions: list[RagSuggestion] = []
    for i in top_idx:
        s = float(scores[i])
        if s <= 0:
            continue
        suggestions.append(RagSuggestion(job_id=job_ids[int(i)], score=s))
    return suggestions

