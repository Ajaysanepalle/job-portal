from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
import models
import schemas
from database import engine, get_db
from auth import hash_password, verify_password, create_access_token, verify_token
import os
from rag_store import build_or_rebuild_index, query_jobs, ensure_index
from free_llm import try_free_llm_answer

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Portal API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip middleware for compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Admin credentials
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
DEFAULT_ADMIN_HASH = hash_password(ADMIN_PASSWORD)

# ===================== HELPER FUNCTIONS =====================

def track_visit(request: Request, db: Session, job_id: int = None):
    """Track user visits"""
    try:
        ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        visit = models.UserVisit(ip_address=ip, user_agent=user_agent, job_id=job_id)
        db.add(visit)
        db.commit()
    except:
        pass  # Don't block requests

def get_current_admin(token: str = None) -> int:
    """Verify admin token and return admin ID"""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    admin_id = verify_token(token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return admin_id

# ===================== ADMIN ENDPOINTS =====================

@app.post("/api/admin/login")
def admin_login(credentials: schemas.AdminLogin, request: Request, db: Session = Depends(get_db)):
    """Admin login"""
    try:
        track_visit(request, db)
    except:
        pass
    
    if credentials.username == ADMIN_USERNAME and (credentials.password == ADMIN_PASSWORD or verify_password(credentials.password, DEFAULT_ADMIN_HASH)):
        # Get or create admin
        admin = db.query(models.Admin).filter(models.Admin.username == credentials.username).first()
        
        if not admin:
            admin = models.Admin(
                username=credentials.username,
                email=f"{credentials.username}@manaworks.online",
                password=DEFAULT_ADMIN_HASH
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        
        token = create_access_token(admin.id)
        return {"access_token": token, "token_type": "bearer", "admin_id": admin.id}
    
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.get("/api/admin/verify")
def verify_admin(token: str):
    """Verify admin token"""
    admin_id = verify_token(token)
    if not admin_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"valid": True, "admin_id": admin_id}

# ===================== JOB ENDPOINTS =====================

@app.post("/api/jobs", response_model=schemas.JobResponse)
def create_job(job: schemas.JobCreate, token: str, db: Session = Depends(get_db)):
    """Create a new job"""
    admin_id = get_current_admin(token)
    
    db_job = models.Job(
        job_name=job.job_name,
        company=job.company,
        job_description=job.job_description,
        eligible_years=job.eligible_years,
        qualification=job.qualification,
        link=job.link,
        location=job.location,
        last_date=job.last_date,
        admin_id=admin_id
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

@app.get("/api/jobs", response_model=list[schemas.JobResponse])
def get_all_jobs(request: Request, db: Session = Depends(get_db)):
    """Get all active jobs"""
    try:
        track_visit(request, db)
    except:
        pass
    
    jobs = db.query(models.Job).filter(
        models.Job.is_active == True
    ).order_by(desc(models.Job.created_at)).all()
    return jobs

@app.get("/api/jobs/{job_id}", response_model=schemas.JobResponse)
def get_job(job_id: int, request: Request, db: Session = Depends(get_db)):
    """Get a specific job"""
    try:
        track_visit(request, db, job_id)
    except:
        pass
    
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.is_active == True
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.put("/api/jobs/{job_id}", response_model=schemas.JobResponse)
def update_job(job_id: int, job_update: schemas.JobUpdate, token: str, db: Session = Depends(get_db)):
    """Update a job"""
    admin_id = get_current_admin(token)
    
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.admin_id == admin_id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    update_data = job_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)
    
    db.commit()
    db.refresh(job)
    return job

@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, token: str, db: Session = Depends(get_db)):
    """Delete a job"""
    admin_id = get_current_admin(token)
    
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.admin_id == admin_id
    ).first()
    
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job.is_active = False
    db.commit()
    return {"message": "Job deleted successfully"}

# ===================== SEARCH ENDPOINTS =====================

@app.get("/api/search", response_model=list[schemas.JobResponse])
def search_jobs(
    q: str = "",
    years: str = "",
    location: str = "",
    request: Request = None,
    db: Session = Depends(get_db)
):
    """Search jobs"""
    if request:
        try:
            track_visit(request, db)
        except:
            pass
    
    query = db.query(models.Job).filter(models.Job.is_active == True)
    
    if q:
        search_term = f"%{q}%"
        query = query.filter(
            (models.Job.job_name.ilike(search_term)) |
            (models.Job.company.ilike(search_term)) |
            (models.Job.job_description.ilike(search_term))
        )
    
    if years:
        query = query.filter(models.Job.eligible_years.ilike(f"%{years}%"))
    
    if location:
        query = query.filter(models.Job.location.ilike(f"%{location}%"))
    
    jobs = query.order_by(desc(models.Job.created_at)).all()
    return jobs

@app.get("/api/years")
def get_available_years(db: Session = Depends(get_db)):
    """Get all available years"""
    jobs = db.query(models.Job.eligible_years).filter(
        models.Job.is_active == True,
        models.Job.eligible_years.isnot(None)
    ).all()
    
    years_set = set()
    for job in jobs:
        if job.eligible_years:
            years_list = [y.strip() for y in str(job.eligible_years).split(",")]
            years_set.update(years_list)
    
    return sorted(list(years_set))

@app.get("/api/locations")
def get_available_locations(db: Session = Depends(get_db)):
    """Get all available locations"""
    locations = db.query(models.Job.location).filter(
        models.Job.is_active == True,
        models.Job.location.isnot(None)
    ).all()
    
    return [loc[0] for loc in locations if loc[0]]

# ===================== STATISTICS ENDPOINTS =====================

@app.get("/api/stats")
def get_stats(request: Request, db: Session = Depends(get_db)):
    """Get statistics"""
    try:
        track_visit(request, db)
    except:
        pass
    
    total_visits = db.query(func.count(models.UserVisit.id)).scalar() or 0
    unique_visitors = db.query(func.count(func.distinct(models.UserVisit.ip_address))).scalar() or 0
    total_jobs = db.query(func.count(models.Job.id)).filter(models.Job.is_active == True).scalar() or 0
    
    return {
        "total_visits": total_visits,
        "unique_visitors": unique_visitors,
        "total_jobs": total_jobs
    }

@app.get("/api/stats/jobs/{job_id}")
def get_job_stats(job_id: int, db: Session = Depends(get_db)):
    """Get job statistics"""
    views = db.query(func.count(models.UserVisit.id)).filter(
        models.UserVisit.job_id == job_id
    ).scalar() or 0
    
    return {"job_id": job_id, "views": views}

# ===================== HEALTH CHECK =====================

@app.get("/api/health")
def health_check():
    """Health check endpoint"""
    return {"status": "OK"}


# ===================== RAG (JOB SUGGESTION) =====================

@app.post("/api/rag/reindex")
def rag_reindex(token: str, db: Session = Depends(get_db)):
    """
    Admin-only: rebuild the local RAG index.
    """
    _ = get_current_admin(token)
    idx = build_or_rebuild_index(db)
    return {"ok": True, "built_at": idx.get("built_at"), "jobs_indexed": len(idx.get("job_ids", []))}


@app.get("/api/rag/ask")
def rag_ask(q: str, k: int = 5, db: Session = Depends(get_db)):
    """
    Ask a question and get suggested jobs to apply for.
    """
    ensure_index(db)
    suggestions = query_jobs(db, q, top_k=k)
    if not suggestions:
        return {"query": q, "suggestions": []}

    job_ids = [s.job_id for s in suggestions]
    jobs = (
        db.query(models.Job)
        .filter(models.Job.id.in_(job_ids), models.Job.is_active == True)  # noqa: E712
        .all()
    )
    jobs_by_id = {j.id: j for j in jobs}

    out = []
    for s in suggestions:
        j = jobs_by_id.get(s.job_id)
        if not j:
            continue
        out.append(
            {
                "score": round(s.score, 4),
                "job": {
                    "id": j.id,
                    "job_name": j.job_name,
                    "company": j.company,
                    "job_description": j.job_description,
                    "eligible_years": j.eligible_years,
                    "qualification": j.qualification,
                    "link": j.link,
                    "location": j.location,
                    "last_date": j.last_date,
                },
            }
        )

    return {"query": q, "suggestions": out}


@app.get("/api/rag/ask_llm")
async def rag_ask_llm(q: str, k: int = 5, db: Session = Depends(get_db)):
    """
    Same as /api/rag/ask, but also returns a free-LLM answer when available.
    Uses Ollama if running; otherwise falls back to retrieval-only.
    """
    base = rag_ask(q=q, k=k, db=db)
    suggestions = base.get("suggestions", [])

    context_lines = []
    for item in suggestions[: min(len(suggestions), 6)]:
        job = item.get("job", {})
        context_lines.append(
            f"- {job.get('job_name','')} @ {job.get('company','')} | {job.get('location','')} | exp: {job.get('eligible_years','')} | qual: {job.get('qualification','')} | last_date: {job.get('last_date','')} | apply: {job.get('link','')}\n"
            f"  desc: {str(job.get('job_description',''))[:400]}"
        )

    prompt = (
        "You are a job assistant. Answer the user's question using ONLY the jobs provided.\n"
        "If nothing matches, say you couldn't find a good match and suggest better keywords.\n\n"
        f"User question: {q}\n\n"
        "Jobs:\n"
        + ("\n".join(context_lines) if context_lines else "(no jobs)\n")
        + "\n\n"
        "Return:\n"
        "1) A short helpful answer (2-6 lines)\n"
        "2) A bullet list of up to 5 best jobs to apply with job title + company + reason\n"
    )

    answer, mode = await try_free_llm_answer(prompt)
    return {
        **base,
        "answer": answer,
        "llm_mode": mode,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
