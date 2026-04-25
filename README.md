# Job Portal Website

A modern Python FastAPI-based job posting platform with admin panel and beautiful frontend.

## Features

✅ **Admin Panel**
- Secure admin login (default: admin/admin123)
- Post job listings with detailed information
- Update existing jobs
- Delete jobs
- View website statistics

✅ **Job Listings**
- Beautiful responsive job cards
- Search by job title, company, description
- Filter by experience level
- Filter by location
- Tabs for different experience levels
- "All Jobs" tab
- View job details

✅ **User Tracking**
- Track total website visits
- Track unique visitors
- Per-job analytics

✅ **Responsive Design**
- Mobile-friendly interface
- Works on all devices
- Modern gradient UI

## Tech Stack

- **Backend**: FastAPI (Python)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Database**: SQLite
- **Styling**: Custom CSS with modern design

## Installation

### Prerequisites
- Python 3.8+
- pip package manager

### Step 1: Clone or Download Project

```bash
git clone https://github.com/Ajaysanepalle/job-portal.git
cd job-portal
```

### Step 2: Install Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### Step 3: Run the Backend

```bash
cd backend
python main.py
```

The API will be available at `http://localhost:8000`

### Step 4: Serve Frontend

You can use Python's built-in server or any HTTP server:

```bash
cd frontend
python -m http.server 8080
```

Or use VS Code Live Server extension, or any other local server.

Open `http://localhost:8080` in your browser.

For deployment configuration:
- Frontend API base URL is controlled by `frontend/config.js`.

## Default Admin Credentials

- **Username**: admin
- **Password**: admin123

**⚠️ IMPORTANT: Change these credentials before production deployment!**

## API Endpoints

### Admin Authentication
- `POST /api/admin/login` - Login admin
- `POST /api/admin/logout` - Logout admin
- `GET /api/admin/verify` - Verify token

### Jobs Management
- `POST /api/jobs?token=<token>` - Create job (Admin only)
- `GET /api/jobs` - Get all jobs
- `GET /api/jobs/{job_id}` - Get specific job
- `PUT /api/jobs/{job_id}?token=<token>` - Update job (Admin only)
- `DELETE /api/jobs/{job_id}?token=<token>` - Delete job (Admin only)

### Search & Filters
- `GET /api/search?q=<query>&years=<years>&location=<location>` - Search jobs
- `GET /api/years` - Get available experience levels
- `GET /api/locations` - Get available locations

### Statistics
- `GET /api/stats` - Get website statistics
- `GET /api/stats/jobs/{job_id}` - Get job-specific stats

## Directory Structure

```
job-portal/
├── backend/
│   ├── main.py           # FastAPI application
│   ├── models.py         # Database models
│   ├── schemas.py        # Pydantic schemas
│   ├── database.py       # Database configuration
│   ├── auth.py           # Authentication utilities
│   ├── requirements.txt  # Python dependencies
│   ├── .env              # Environment variables
│   └── job_portal.db     # SQLite database (auto-created)
│
└── frontend/
    ├── index.html        # Main HTML file
    ├── styles.css        # Styling
    ├── app.js            # Frontend JavaScript
    └── README.md         # This file
```

## Deployment Options

### Option 1: Heroku (Free)

1. Create Heroku account at https://www.heroku.com
2. Install Heroku CLI
3. Create `Procfile` in backend directory:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
4. Create `runtime.txt`:
   ```
   python-3.11.0
   ```
5. Deploy:
   ```bash
   git init
   heroku login
   heroku create your-app-name
   git push heroku main
   ```

### Option 2: Railway

Use the full guide in `RAILWAY_DEPLOYMENT.md`.

Quick summary:
1. Deploy `backend` as one Railway service
2. Add Railway PostgreSQL and set `DATABASE_URL`
3. Deploy `frontend` as second Railway service
4. Set `frontend/config.js` with backend API URL

### Option 3: PythonAnywhere (Free)

1. Go to https://www.pythonanywhere.com
2. Upload your backend
3. Configure WSGI file
4. Host frontend separately on GitHub Pages or Netlify

### Option 4: Vercel + Render

- Host frontend on Vercel
- Host backend on Render.com (free tier)

### Option 5: Local VPS

Deploy to any VPS (AWS EC2, DigitalOcean, etc.) with:
```bash
# Install dependencies
pip install -r requirements.txt

# Run with Gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 main:app

# Use Nginx as reverse proxy
```

## Configuration

Edit `.env` file in backend directory:

```
DATABASE_URL=sqlite:///job_portal.db
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## Usage

### For Users

1. Visit the website
2. Browse jobs or use search
3. Filter by experience level or location
4. Click job card to see details
5. Click "Apply Now" button to apply

### For Admin

1. Click "Admin Login" button
2. Login with credentials (default: admin/admin123)
3. Access admin panel with tabs:
   - **Add Job**: Post new job
   - **Manage Jobs**: Edit or delete existing jobs
   - **Statistics**: View website analytics

## Security Notes

1. ⚠️ Change default admin password immediately
2. 🔒 Use HTTPS in production
3. 🛡️ Enable CORS only for trusted domains
4. 🔐 Store sensitive data in environment variables
5. 📝 Use proper JWT tokens in production

## Known Limitations

- Uses SQLite (suitable for small-scale. Use PostgreSQL for production)
- Simple token management (use proper JWT in production)
- No email notifications
- No user registration

## Future Enhancements

- User registration and job applications
- Email notifications
- Advanced admin analytics
- Job categories
- Saved jobs feature
- Email alerts for new jobs
- Social sharing

## Contributing

Feel free to fork this project and submit pull requests.

## Support

For issues or questions, create an issue on GitHub.

## License

MIT License - feel free to use this project

## Author

**Ajaysanepalle**
- GitHub: https://github.com/Ajaysanepalle

---

**Made with ❤️ for job seekers and companies**
