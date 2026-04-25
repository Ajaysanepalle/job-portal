const API_BASE = (() => {
    const configured = window.APP_CONFIG?.API_BASE || "";
    if (configured) return configured.replace(/\/+$/, "");

    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    if (isLocal) return "http://localhost:8000/api";

    // If frontend and backend are behind same domain/proxy.
    return `${window.location.origin}/api`;
})();

let currentAdminToken = localStorage.getItem("adminToken");
let allJobs = [];
let allYears = [];
let allLocations = [];

// ============= PERFORMANCE OPTIMIZATION =============
const apiCache = new Map();
const CACHE_TIME = 5 * 60 * 1000;
let searchTimeout;

function debounce(func, delay) {
    return function(...args) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => func(...args), delay);
    };
}

async function cachedFetch(url, options = {}) {
    const cacheKey = url + JSON.stringify(options);
    
    if (apiCache.has(cacheKey)) {
        const { data, timestamp } = apiCache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_TIME) {
            return data;
        }
        apiCache.delete(cacheKey);
    }
    
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (response.ok && (!options.method || options.method === "GET")) {
        apiCache.set(cacheKey, { data, timestamp: Date.now() });
    }
    
    return { data, ok: response.ok, status: response.status };
}

function showLoading(show = true) {
    let loader = document.getElementById("loadingSpinner");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "loadingSpinner";
        loader.innerHTML = '<div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 9999;"><div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite;"></div></div>';
        document.body.appendChild(loader);
        
        const style = document.createElement("style");
        style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
    }
    loader.style.display = show ? "block" : "none";
}

// ============= MODAL MANAGEMENT =============
const adminModal = document.getElementById("adminModal");
const adminDashboard = document.getElementById("adminDashboard");
const adminLoginBtn = document.getElementById("adminLoginBtn");
const jobModal = document.getElementById("jobModal");

document.querySelectorAll(".close").forEach(closeBtn => {
    closeBtn.addEventListener("click", (e) => {
        e.target.closest(".modal").style.display = "none";
    });
});

window.addEventListener("click", (e) => {
    if (e.target === adminModal) adminModal.style.display = "none";
    if (e.target === adminDashboard) adminDashboard.style.display = "none";
    if (e.target === jobModal) jobModal.style.display = "none";
});

adminLoginBtn.addEventListener("click", () => {
    if (currentAdminToken) {
        adminDashboard.style.display = "block";
        loadAdminDashboard();
    } else {
        adminModal.style.display = "block";
    }
});

// ============= ADMIN LOGIN =============
document.getElementById("adminLoginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showLoading(true);
    
    const username = document.getElementById("adminUsername").value;
    const password = document.getElementById("adminPassword").value;
    
    try {
        const response = await fetch(`${API_BASE}/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentAdminToken = data.access_token;
            localStorage.setItem("adminToken", currentAdminToken);
            adminModal.style.display = "none";
            adminLoginBtn.textContent = "Admin Panel";
            adminDashboard.style.display = "block";
            loadAdminDashboard();
            showAlert("Login successful!", "success");
            apiCache.clear();
        } else {
            showAlert(data.detail || "Invalid credentials", "error");
        }
    } catch (error) {
        showAlert("Login failed: " + error.message, "error");
    }
    showLoading(false);
});

// ============= ADMIN LOGOUT =============
document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("adminToken");
    currentAdminToken = null;
    adminDashboard.style.display = "none";
    adminLoginBtn.textContent = "Admin Login";
    showAlert("Logged out successfully", "success");
    apiCache.clear();
    loadJobs();
});

// ============= ADMIN TAB MANAGEMENT =============
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        if (btn.classList.contains("logout-btn")) return;
        
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        
        btn.classList.add("active");
        const tabId = btn.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
        
        if (tabId === "manage-jobs") {
            loadAdminJobs();
        } else if (tabId === "stats") {
            loadStats();
        }
    });
});

// ============= JOB FORM SUBMISSION =============
const originalFormHandler = async (e) => {
    e.preventDefault();
    showLoading(true);
    
    if (!currentAdminToken) {
        showAlert("Please login first", "error");
        showLoading(false);
        return;
    }
    
    const jobData = {
        job_name: document.getElementById("jobName").value,
        company: document.getElementById("company").value,
        job_description: document.getElementById("jobDescription").value,
        eligible_years: document.getElementById("eligibleYears").value,
        qualification: document.getElementById("qualification").value,
        link: document.getElementById("link").value,
        location: document.getElementById("location").value,
        last_date: document.getElementById("lastDate").value
    };
    
    try {
        const response = await fetch(`${API_BASE}/jobs?token=${currentAdminToken}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(jobData)
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            document.getElementById("jobForm").reset();
            showAlert("Job posted successfully!", "success");
            apiCache.clear();
            loadAdminJobs();
            loadJobs();
            loadFilters();
        } else {
            showAlert(responseData.detail || "Failed to post job", "error");
        }
    } catch (error) {
        showAlert("Error: " + error.message, "error");
    } finally {
        showLoading(false);
    }
};

document.getElementById("jobForm").addEventListener("submit", originalFormHandler);

// ============= LOAD ADMIN JOBS =============
async function loadAdminJobs() {
    if (!currentAdminToken) return;
    
    try {
        showLoading(true);
        const response = await cachedFetch(`${API_BASE}/jobs?token=${currentAdminToken}`);
        const jobs = response.data;
        
        const adminJobsList = document.getElementById("adminJobsList");
        
        if (!jobs || jobs.length === 0) {
            adminJobsList.innerHTML = '<div class="empty-state"><i class="fas fa-briefcase"></i><p>No jobs posted yet</p></div>';
            showLoading(false);
            return;
        }
        
        adminJobsList.innerHTML = jobs.map(job => `
            <div class="admin-job-item">
                <h4>${job.job_name}</h4>
                <p><strong>${job.company}</strong> | ${job.location}</p>
                <p style="color: #e74c3c; font-weight: bold;">Last date: ${job.last_date}</p>
                <div class="admin-job-actions">
                    <button class="btn btn-primary" onclick="editJob(${job.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteJob(${job.id})">Delete</button>
                </div>
            </div>
        `).join("");
        showLoading(false);
    } catch (error) {
        console.error("Error loading admin jobs:", error);
        showLoading(false);
    }
}

// ============= EDIT JOB =============
async function editJob(jobId) {
    if (!currentAdminToken) {
        showAlert("Please login first", "error");
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch(`${API_BASE}/jobs/${jobId}`);
        
        if (!response.ok) {
            throw new Error(`Failed to load job: ${response.status}`);
        }
        
        const job = await response.json();
        
        document.getElementById("jobName").value = job.job_name;
        document.getElementById("company").value = job.company;
        document.getElementById("jobDescription").value = job.job_description;
        document.getElementById("eligibleYears").value = job.eligible_years;
        document.getElementById("qualification").value = job.qualification;
        document.getElementById("link").value = job.link;
        document.getElementById("location").value = job.location;
        document.getElementById("lastDate").value = job.last_date;
        
        window.editingJobId = jobId;
        
        const jobForm = document.getElementById("jobForm");
        
        jobForm.onsubmit = async (e) => {
            e.preventDefault();
            showLoading(true);
            
            const jobData = {
                job_name: document.getElementById("jobName").value,
                company: document.getElementById("company").value,
                job_description: document.getElementById("jobDescription").value,
                eligible_years: document.getElementById("eligibleYears").value,
                qualification: document.getElementById("qualification").value,
                link: document.getElementById("link").value,
                location: document.getElementById("location").value,
                last_date: document.getElementById("lastDate").value
            };
            
            try {
                const updateResponse = await fetch(`${API_BASE}/jobs/${window.editingJobId}?token=${currentAdminToken}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(jobData)
                });
                
                const updateData = await updateResponse.json();
                
                if (updateResponse.ok) {
                    jobForm.reset();
                    jobForm.onsubmit = originalFormHandler;
                    window.editingJobId = null;
                    showAlert("Job updated successfully!", "success");
                    apiCache.clear();
                    loadAdminJobs();
                    loadJobs();
                    loadFilters();
                    showLoading(false);
                } else {
                    showAlert(updateData.detail || "Failed to update job", "error");
                    showLoading(false);
                }
            } catch (error) {
                showAlert("Error: " + error.message, "error");
                showLoading(false);
            }
        };
        
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
        document.querySelector('[data-tab="add-jobs"]').classList.add("active");
        document.getElementById("add-jobs").classList.add("active");
        showLoading(false);
    } catch (error) {
        showAlert("Error loading job: " + error.message, "error");
        showLoading(false);
    }
}

// ============= DELETE JOB =============
async function deleteJob(jobId) {
    if (!confirm("Are you sure you want to delete this job?")) return;
    showLoading(true);
    
    if (!currentAdminToken) {
        showAlert("Session expired. Please login again", "error");
        localStorage.removeItem("adminToken");
        currentAdminToken = null;
        showLoading(false);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}?token=${currentAdminToken}`, {
            method: "DELETE"
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            showAlert("Job deleted successfully", "success");
            apiCache.clear();
            loadAdminJobs();
            loadJobs();
        } else {
            showAlert(responseData.detail || "Failed to delete job", "error");
            console.error("Delete error:", response.status);
        }
    } catch (error) {
        showAlert("Error deleting job: " + error.message, "error");
    } finally {
        showLoading(false);
    }
}

// ============= LOAD STATISTICS =============
async function loadStats() {
    try {
        showLoading(true);
        const response = await cachedFetch(`${API_BASE}/stats`);
        const stats = response.data;
        
        document.getElementById("totalVisits").textContent = stats.total_visits;
        document.getElementById("uniqueVisitors").textContent = stats.unique_visitors;
        document.getElementById("totalJobs").textContent = stats.total_jobs;
        showLoading(false);
    } catch (error) {
        console.error("Error loading stats:", error);
        showLoading(false);
    }
}

// ============= LOAD ADMIN DASHBOARD =============
function loadAdminDashboard() {
    if (currentAdminToken) {
        document.querySelector(".tab-btn.active").click();
    }
}

// ============= LOAD ALL JOBS =============
async function loadJobs() {
    try {
        showLoading(true);
        const response = await cachedFetch(`${API_BASE}/jobs`);
        allJobs = response.data || [];
        displayJobs(allJobs);
        showLoading(false);
    } catch (error) {
        console.error("Error loading jobs:", error);
        showLoading(false);
    }
}

// ============= DISPLAY JOBS (WITH PAGINATION) =============
const JOBS_PER_PAGE = 10;
let currentPage = 1;

function displayJobs(jobs) {
    const jobsList = document.getElementById("jobsList");
    
    if (!jobs || jobs.length === 0) {
        jobsList.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No jobs found</p></div>';
        return;
    }
    
    currentPage = 1;
    const paginatedJobs = jobs.slice(0, JOBS_PER_PAGE);
    
    jobsList.innerHTML = paginatedJobs.map(job => `
        <div class="job-card" onclick="viewJobDetails(${job.id})">
            <h3>${job.job_name}</h3>
            <p class="job-company"><i class="fas fa-building"></i> ${job.company}</p>
            <div class="job-meta">
                <div class="job-meta-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${job.location}</span>
                </div>
                <div class="job-meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${job.eligible_years}</span>
                </div>
            </div>
            <p class="job-description">${job.job_description}</p>
            <div class="job-footer">
                <span class="last-date"><i class="fas fa-calendar"></i> ${job.last_date}</span>
                <button class="btn btn-primary" onclick="event.stopPropagation(); openJobLink('${job.link}')">
                    Apply Now
                </button>
            </div>
        </div>
    `).join("");
    
    if (jobs.length > JOBS_PER_PAGE) {
        jobsList.innerHTML += `
            <div style="text-align: center; padding: 20px;">
                <button class="btn btn-secondary" onclick="loadMoreJobs(${jobs.length})">
                    Load More Jobs (${jobs.length - paginatedJobs.length} remaining)
                </button>
            </div>
        `;
    }
}

// Load more jobs
function loadMoreJobs(totalJobs) {
    currentPage++;
    const end = currentPage * JOBS_PER_PAGE;
    const morePaginatedJobs = allJobs.slice(0, end);
    
    const jobsList = document.getElementById("jobsList");
    
    jobsList.innerHTML = morePaginatedJobs.map(job => `
        <div class="job-card" onclick="viewJobDetails(${job.id})">
            <h3>${job.job_name}</h3>
            <p class="job-company"><i class="fas fa-building"></i> ${job.company}</p>
            <div class="job-meta">
                <div class="job-meta-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${job.location}</span>
                </div>
                <div class="job-meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${job.eligible_years}</span>
                </div>
            </div>
            <p class="job-description">${job.job_description}</p>
            <div class="job-footer">
                <span class="last-date"><i class="fas fa-calendar"></i> ${job.last_date}</span>
                <button class="btn btn-primary" onclick="event.stopPropagation(); openJobLink('${job.link}')">
                    Apply Now
                </button>
            </div>
        </div>
    `).join("");
    
    if (allJobs.length > end) {
        jobsList.innerHTML += `
            <div style="text-align: center; padding: 20px;">
                <button class="btn btn-secondary" onclick="loadMoreJobs(${totalJobs})">
                    Load More Jobs (${allJobs.length - end} remaining)
                </button>
            </div>
        `;
    }
}

// ============= VIEW JOB DETAILS =============
function viewJobDetails(jobId) {
    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;
    
    const jobDetails = document.getElementById("jobDetails");
    jobDetails.innerHTML = `
        <div class="job-details-content">
            <div class="job-details-header">
                <h2>${job.job_name}</h2>
                <p class="job-company"><i class="fas fa-building"></i> ${job.company}</p>
            </div>
            <div class="job-details-body">
                <div class="detail-row">
                    <strong>Location:</strong>
                    <p>${job.location}</p>
                </div>
                <div class="detail-row">
                    <strong>Experience:</strong>
                    <p>${job.eligible_years}</p>
                </div>
                <div class="detail-row">
                    <strong>Qualification:</strong>
                    <p>${job.qualification}</p>
                </div>
                <div class="detail-row">
                    <strong>Last Date:</strong>
                    <p class="last-date">${job.last_date}</p>
                </div>
                <div class="detail-row">
                    <strong>Description:</strong>
                    <p>${job.job_description}</p>
                </div>
                <div class="detail-row">
                    <strong>Apply:</strong>
                    <p><a href="${job.link}" target="_blank" style="color: var(--primary-color); text-decoration: none;">Click here to apply</a></p>
                </div>
                <button class="btn btn-primary" onclick="openJobLink('${job.link}')">
                    <i class="fas fa-external-link-alt"></i> Open Application
                </button>
            </div>
        </div>
    `;
    
    jobModal.style.display = "block";
}

function openJobLink(link) {
    window.open(link, "_blank");
}

// ============= LOAD FILTERS =============
async function loadFilters() {
    try {
        const [yearsResponse, locationsResponse] = await Promise.all([
            cachedFetch(`${API_BASE}/years`),
            cachedFetch(`${API_BASE}/locations`)
        ]);
        
        allYears = yearsResponse.data || [];
        allLocations = locationsResponse.data || [];
        
        const yearsFilter = document.getElementById("yearsFilter");
        yearsFilter.innerHTML = '<option value="">All Years</option>' + 
            allYears.map(year => `<option value="${year}">${year}</option>`).join("");
        
        const locationFilter = document.getElementById("locationFilter");
        locationFilter.innerHTML = '<option value="">All Locations</option>' + 
            allLocations.map(loc => `<option value="${loc}">${loc}</option>`).join("");
        
        const yearsTabsContainer = document.getElementById("yearsTabsContainer");
        yearsTabsContainer.innerHTML = allYears.map(year => 
            `<button class="job-tab-btn" data-tab="years-${year.replace(/\s+/g, '-')}">${year}</button>`
        ).join("");
        
        document.querySelectorAll(".job-tab-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                document.querySelectorAll(".job-tab-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                
                const tabName = btn.getAttribute("data-tab");
                if (tabName === "all-jobs") {
                    displayJobs(allJobs);
                } else {
                    const year = btn.textContent;
                    const filtered = allJobs.filter(job => job.eligible_years.includes(year));
                    displayJobs(filtered);
                }
            });
        });
    } catch (error) {
        console.error("Error loading filters:", error);
    }
}

// ============= SEARCH FUNCTIONALITY =============
document.getElementById("searchBtn").addEventListener("click", performSearch);
document.getElementById("searchInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") performSearch();
});

document.getElementById("searchInput").addEventListener("input", debounce(performSearch, 500));

async function performSearch() {
    const query = document.getElementById("searchInput").value;
    const years = document.getElementById("yearsFilter").value;
    const location = document.getElementById("locationFilter").value;
    
    try {
        showLoading(true);
        let url = `${API_BASE}/search?`;
        if (query) url += `q=${encodeURIComponent(query)}&`;
        if (years) url += `years=${encodeURIComponent(years)}&`;
        if (location) url += `location=${encodeURIComponent(location)}&`;
        
        const response = await cachedFetch(url);
        const results = response.data || [];
        displayJobs(results);
        
        document.querySelectorAll(".job-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelector('[data-tab="all-jobs"]').classList.add("active");
        showLoading(false);
    } catch (error) {
        console.error("Error searching:", error);
        showLoading(false);
    }
}

// ============= FILTER CHANGE LISTENERS =============
document.getElementById("yearsFilter").addEventListener("change", debounce(performSearch, 300));
document.getElementById("locationFilter").addEventListener("change", debounce(performSearch, 300));

document.getElementById("resetFilters").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("yearsFilter").value = "";
    document.getElementById("locationFilter").value = "";
    document.querySelectorAll(".job-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelector('[data-tab="all-jobs"]').classList.add("active");
    loadJobs();
});

// ============= RAG JOB ASSISTANT =============
const ragQuestionEl = document.getElementById("ragQuestion");
const ragAskBtn = document.getElementById("ragAskBtn");
const ragResultsEl = document.getElementById("ragResults");

async function askRag() {
    const q = (ragQuestionEl?.value || "").trim();
    if (!q) {
        showAlert("Type a question first", "error");
        return;
    }

    try {
        showLoading(true);
        ragResultsEl.innerHTML = "";

        const resp = await fetch(`${API_BASE}/rag/ask_llm?q=${encodeURIComponent(q)}&k=6`);
        const data = await resp.json();

        const suggestions = data?.suggestions || [];
        if (!resp.ok) {
            showAlert(data?.detail || "Failed to get suggestions", "error");
            return;
        }

        if (data?.answer) {
            ragResultsEl.innerHTML = `
                <div class="job-card" style="cursor: default;">
                    <h3><i class="fas fa-robot"></i> Assistant</h3>
                    <p style="white-space: pre-wrap; margin-top: 8px;">${data.answer}</p>
                    <p style="opacity: 0.7; margin-top: 8px; font-size: 12px;">LLM: ${data.llm_mode || "fallback"}</p>
                </div>
            `;
        }

        if (suggestions.length === 0) {
            ragResultsEl.innerHTML += '<div class="empty-state"><i class="fas fa-robot"></i><p>No matching jobs found. Try different keywords.</p></div>';
            return;
        }

        ragResultsEl.innerHTML += suggestions.map(item => {
            const job = item.job;
            return `
                <div class="job-card" onclick="viewJobDetails(${job.id})">
                    <h3>${job.job_name}</h3>
                    <p class="job-company"><i class="fas fa-building"></i> ${job.company}</p>
                    <div class="job-meta">
                        <div class="job-meta-item">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${job.location}</span>
                        </div>
                        <div class="job-meta-item">
                            <i class="fas fa-clock"></i>
                            <span>${job.eligible_years}</span>
                        </div>
                    </div>
                    <p class="job-description">${job.job_description}</p>
                    <div class="job-footer">
                        <span class="last-date"><i class="fas fa-calendar"></i> ${job.last_date}</span>
                        <button class="btn btn-primary" onclick="event.stopPropagation(); openJobLink('${job.link}')">
                            Apply Now
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    } catch (e) {
        showAlert("RAG error: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}

if (ragAskBtn) ragAskBtn.addEventListener("click", askRag);
if (ragQuestionEl) ragQuestionEl.addEventListener("keypress", (e) => {
    if (e.key === "Enter") askRag();
});

// ============= ALERT HELPER =============
function showAlert(message, type) {
    const alert = document.createElement("div");
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    document.body.insertBefore(alert, document.body.firstChild);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

// ============= INITIALIZATION =============
document.addEventListener("DOMContentLoaded", () => {
    if (currentAdminToken) {
        adminLoginBtn.textContent = "Admin Panel";
    }
    
    loadJobs();
    loadFilters();
});
