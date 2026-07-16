# PS Apprentice Assessment — Vercel Deployment

A VS Code-style candidate assessment with code-based login, auto-grading, AI essay scoring, and Google Sheets integration.

## Quick Deploy

### 1. Clone & install
```bash
git clone <your-repo>
cd ps-assessment
npm install
```

### 2. Set environment variables
```bash
cp .env.example .env
# Edit .env and add your Anthropic API key:
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Run locally
```bash
npm run dev
```

### 4. Deploy to Vercel
```bash
npm install -g vercel
vercel
# Follow prompts — add ANTHROPIC_API_KEY in Vercel dashboard under Settings > Environment Variables
```

Or connect your GitHub repo to Vercel for automatic deploys.

---

## Google Sheets Setup

### Sheet structure (tab: "Codes")
| A: Code    | B: Name         | C: Status | D: Submitted | E: Score | F: % |
|------------|-----------------|-----------|--------------|----------|------|
| HFPS001    | Juan dela Cruz  | Unused    |              |          |      |
| HFPS002    | Maria Santos    | Unused    |              |          |      |

### Apps Script
1. Open your Google Sheet → Extensions → Apps Script
2. Paste the code from `apps-script.js` in this folder
3. Deploy → New deployment → Web app
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the deployment URL

### Candidate invitation email
```
Hi [Name],

Please complete your PS Apprentice Assessment at:
https://your-app.vercel.app

Assessment server URL: https://script.google.com/macros/s/.../exec
Your personal code: HFPS001

Your code can only be used once. Once submitted, it cannot be reused.
```

---

## How code validation works
1. Candidate enters URL + code → app makes GET request to Apps Script
2. Apps Script checks the Codes sheet: code must exist and be "Unused"
3. Valid → candidate's name is loaded from the sheet, assessment begins
4. On submission → code is marked "Used", results written to Submissions sheet
5. If someone tries the same code again → blocked with a clear error message

---

## Project structure
```
ps-assessment/
├── api/
│   └── score-essay.js     Vercel serverless function (keeps API key server-side)
├── src/
│   ├── App.jsx            Main assessment component
│   ├── main.jsx           React entry point
│   └── index.css          VS Code theme CSS variables
├── index.html
├── package.json
├── vite.config.js
├── vercel.json
└── apps-script.js         Google Apps Script (paste into your sheet)
```
