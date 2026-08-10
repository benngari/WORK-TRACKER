# Work Tracker — Personal Work, Job, Attendance & Payment Tracking System

A personal system to track jobs across clients/companies and sites (banks, offices,
shops, warehouses, institutions, customer premises), attendance/callouts, expected vs.
actual payments, M-PESA reconciliation, documents, and historical records.

Core relationship: **Client/Company → Site/Location → Job → Attendance → Expected
Payment → Actual Payment → M-PESA Transaction**

## Project structure

```
work-tracker/
├── backend/     Node.js + Express + MongoDB (Mongoose) API
└── frontend/    React + Vite + Tailwind CSS
```

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router, Recharts, Axios → deploy to **Vercel**
- **Backend:** Node.js, Express, Mongoose, JWT auth, Multer + Cloudinary → deploy to **Render**
- **Database:** MongoDB (free tier via **MongoDB Atlas**)
- **File storage:** Cloudinary (job cards, statements, M-PESA screenshots)

---

## 1. Run locally first (recommended before deploying)

### Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env with your real values (see "Getting your credentials" below)
npm run dev
```

The API will run at `http://localhost:5000`. Visit `http://localhost:5000/api/health`
to confirm it's alive.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# VITE_API_URL=http://localhost:5000/api  (default is already correct for local dev)
npm run dev
```

Visit `http://localhost:5173`, click **Create one** to register your account, then sign in.

---

## 2. Getting your credentials

### MongoDB Atlas (free tier)

1. Go to https://www.mongodb.com/cloud/atlas/register and create a free account.
2. Create a free **M0 cluster**.
3. Under **Database Access**, create a database user with a username/password.
4. Under **Network Access**, add `0.0.0.0/0` (allow access from anywhere) so Render can connect.
5. Click **Connect → Drivers**, copy the connection string. It looks like:
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Add a database name before the `?`, e.g. `.../work-tracker?retryWrites=true...`
7. Paste this into `MONGO_URI` in your backend `.env`.

### Cloudinary (free tier)

1. Sign up at https://cloudinary.com/users/register_free
2. On your Cloudinary dashboard, copy **Cloud Name**, **API Key**, and **API Secret**.
3. Paste these into `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

### JWT secret

Generate a random string for `JWT_SECRET`, e.g. run:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 3. Push to GitHub

From the `work-tracker` folder (containing both `backend/` and `frontend/`):

```bash
git init
git add .
git commit -m "Initial commit: work tracker app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

Both `backend/.gitignore` and `frontend/.gitignore` already exclude `node_modules/`
and `.env` files, so your secrets won't be pushed to GitHub.

---

## 4. Deploy the backend to Render

1. Go to https://render.com and sign in with GitHub.
2. Click **New → Web Service**, select your repo.
3. Set **Root Directory** to `backend`.
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. Under **Environment**, add each variable from `backend/.env.example` with your real values:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `CLIENT_ORIGINS` — set this to your Vercel URL once you have it (you can update it after step 5)
   - `ALLOW_SELF_REGISTER=true` (set to `false` after you've created your one account, so no one else can register)
7. Click **Create Web Service**. Render will give you a URL like `https://work-tracker-api.onrender.com`.
8. Confirm it's live: visit `https://work-tracker-api.onrender.com/api/health`.

> Render's free tier spins down after inactivity — the first request after a while
> may take 30–60 seconds to wake up. This is normal.

---

## 5. Deploy the frontend to Vercel

1. Go to https://vercel.com and sign in with GitHub.
2. Click **Add New → Project**, select your repo.
3. Set **Root Directory** to `frontend`.
4. Vercel auto-detects Vite — build command `npm run build`, output directory `dist`.
5. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://work-tracker-api.onrender.com/api` (your Render URL + `/api`)
6. Click **Deploy**. You'll get a URL like `https://work-tracker.vercel.app`.
7. Go back to Render, update `CLIENT_ORIGINS` to include this Vercel URL (comma-separated
   if you keep localhost too), and redeploy the backend so CORS allows your frontend.

---

## 6. Create your account and sign in

Visit your Vercel URL, click **Create one**, register with your name/email/password.
This is your personal account — once you've created it, set `ALLOW_SELF_REGISTER=false`
on Render so the registration endpoint is disabled to everyone else.

---

## How the data model works

- **Client** — a company you do work for (DTE, another contractor, a direct customer...).
- **Site** — a location under a client. Banks get bank name/branch/branch code; other
  site types get a site name. Every site has town/county/location.
- **Job** — the central record. Belongs to a client + site, has a rate, status, and
  payment status. Expected payment = number of attendance records × job rate (or a
  manual override).
- **Attendance** — one row per date you actually worked. Multiple attendance rows can
  belong to one job (e.g. 5 callouts at KCB TRM = 5 attendance records).
- **MpesaTransaction** — parsed from a pasted M-PESA SMS. Duplicate transaction codes
  are blocked.
- **Payment** — an actual amount received (usually linked to an MpesaTransaction).
- **PaymentAllocation** — links a Payment to a Job with an amount, so one M-PESA
  payment can be split across multiple jobs, and a job's outstanding balance is always
  `expected − sum(allocations)`.
- **JobDocument** — Cloudinary-hosted files (job cards, statements, screenshots),
  optionally linked to a job, or standalone for historical statements.
- **Transport** — fare tracked separately from the callout rate.
- **HistoricalRecord** — free-form entries for pre-system records.

## Notes on what's built vs. what to extend

This is a complete, working full-stack app: authentication, all CRUD entities, M-PESA
paste-and-parse with manual correction, payment allocation/reconciliation, Cloudinary
uploads, dashboard with charts, payment ledger, outstanding payments, calendar, global
search, and historical records.

Reasonable next steps you may want to add over time:
- Editing existing jobs/sites/clients from a dedicated edit form (currently create + delete are wired up everywhere; update endpoints already exist on the backend for all entities, so wiring up "Edit" buttons is mostly frontend work).
- CSV/PDF export for the Payment Ledger.
- Push/email reminders for jobs approaching their payment due date.
"# WORK-TRACKER" 
"# WORK-TRACKER" 
"# WORK-TRACKER" 
