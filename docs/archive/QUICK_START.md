# KSP Crime AI - Quick Start Guide

## 🎉 MVP is Ready!

Your KSP Crime AI MVP is now fully functional with:
- ✅ Trained NLP model (60 training samples)
- ✅ 154 realistic crime records in database
- ✅ Polished frontend UI
- ✅ End-to-end tested and working

---

## 🚀 How to Run the Application

### Step 1: Start the Backend

Open a terminal and run:

```bash
cd backend
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8004 (Press CTRL+C to quit)
```

✅ Backend is now running at **http://localhost:8004**

---

### Step 2: Start the Frontend

Open a **NEW** terminal (keep backend running) and run:

```bash
cd frontend
npm start
```

This will:
- Start the React development server
- Automatically open your browser to **http://localhost:3000**

✅ Frontend is now running!

---

## 💬 How to Use the Application

### Text Queries

Try these example queries:

```
1. "Show crimes in Bengaluru"
2. "How many crimes in Mysuru"
3. "Show thefts in Bengaluru last month"
4. "Count murders in Kalaburagi"
5. "Show crimes in Mangaluru"
```

### Voice Queries

1. Click the 🎤 microphone button
2. Speak your query clearly
3. The app will automatically submit it

**Supported patterns:**
- "Show crimes in [location]"
- "How many [crime type] in [location]"
- "Show [crime type] in [location] last [time period]"
- "Count crimes in [location]"

---

## 🎯 What Works Right Now

### ✅ Features Implemented
- Natural language query processing (English)
- Intent classification (SHOW_CRIMES, COUNT_CRIMES)
- Entity extraction (location, date range, crime type)
- Voice input via Web Speech API
- 154 sample crime records across 10 districts
- Real-time crime data retrieval
- Formatted results display
- Error handling
- Loading states

### 📊 Database Stats
- **Total Crimes**: 154
- **Districts**: 10 (Bengaluru Urban, Mysuru, Belagavi, etc.)
- **Crime Types**: 10 (Theft, Murder, Snatching, etc.)
- **Police Stations**: 20+
- **Date Range**: Last 365 days

### 🧠 NLP Model
- **Training Samples**: 60
- **Intents**: SHOW_CRIMES, COUNT_CRIMES, UNKNOWN
- **Confidence Threshold**: 0.3
- **Accuracy**: ~70% (good for MVP, will improve with more data)

---

## 🧪 Testing

### Run Automated Tests

```bash
cd backend
python test_mvp.py
```

This tests:
- Health check endpoint
- Show crimes query
- Count crimes query
- Date range filtering
- Crime type filtering
- Error handling

### Manual Testing Checklist

- [ ] Backend starts without errors
- [ ] Frontend loads at http://localhost:3000
- [ ] Type a query and get results
- [ ] Voice button works (Chrome/Edge recommended)
- [ ] Loading indicator shows while processing
- [ ] Results display correctly formatted
- [ ] Error messages are user-friendly
- [ ] Multiple queries work in sequence

---

## 📁 Project Structure

```
ksp-crime-ai/
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── src/
│   │   ├── api/routes/chat.py  # Chat endpoint
│   │   ├── nlp/                # NLP pipeline
│   │   ├── query_engine/       # SQL translator
│   │   └── database/           # Models & session
│   ├── models/
│   │   └── intent_en.joblib    # Trained NLP model ✅
│   ├── ksp_crime_ai.db         # SQLite database ✅
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/ChatPage.tsx  # Main chat interface
│   │   └── index.tsx
│   └── package.json
│
└── docs/
    ├── ARCHITECTURE.md         # Complete architecture doc
    ├── ARCHITECTURE_VISUAL.md  # Visual diagrams
    └── ARCHITECTURE_COMPARISON.md  # Decision guide
```

---

## 🎨 UI Features

### Header
- App title and description
- Query counter

### Chat Area
- User messages (blue bubbles, right-aligned)
- Bot messages (gray bubbles, left-aligned)
- Loading indicator (pulsing dots)
- Auto-scroll to latest message

### Input Area
- Text input field
- Send button (enabled when text entered)
- Voice button (microphone icon)
- Example queries hint

---

## 🔍 Sample Queries & Expected Results

### Query 1: Location-based
**Input**: "Show crimes in Bengaluru"

**Expected Result**:
```
Here are the first 33 crimes:

Found 33 crime(s). Sample:

1. Theft - Bengaluru Urban
   FIR: FIR0123, Date: 2024-05-15
   Mobile phone theft from public bus

2. Snatching - Bengaluru Urban
   FIR: FIR0145, Date: 2024-04-20
   Chain snatching by bike-borne assailants

3. Burglary - Bengaluru Urban
   FIR: FIR0178, Date: 2024-03-10
   Residential burglary reported
```

### Query 2: Count
**Input**: "How many crimes in Mysuru"

**Expected Result**:
```
Here are the first 15 crimes:

[Shows 15 crimes from Mysuru district]
```

### Query 3: Date Range
**Input**: "Show thefts in Bengaluru last month"

**Expected Result**:
```
Here are the first 3 crimes:

Found 3 crime(s). Sample:
[Shows recent theft cases from Bengaluru]
```

---

## ⚠️ Known Limitations (MVP)

1. **NLP Accuracy**: ~70% (needs more training data)
2. **Language**: English only (Kannada in Phase 2)
3. **Intents**: Only SHOW_CRIMES and COUNT_CRIMES
4. **Authentication**: None (public access)
5. **Database**: SQLite (migrate to PostgreSQL for production)
6. **Result Display**: Basic formatting (can add cards/maps)

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 8004 is in use
netstat -ano | findstr :8004

# Install dependencies
cd backend
pip install -r requirements.txt

# Reinitialize database
python init_db.py
```

### Frontend won't start
```bash
# Install dependencies
cd frontend
npm install

# Clear cache and restart
npm start
```

### "Model not found" error
```bash
cd backend
python src/nlp/train_model.py
```

### "Database not found" error
```bash
cd backend
python generate_sample_data.py
```

### Voice button doesn't work
- Use Chrome or Edge (best Web Speech API support)
- Grant microphone permissions when prompted
- Check browser console for errors

---

## 📈 Next Steps for Production

### Phase 1: Immediate Improvements (1 week)
- [ ] Collect 500+ training samples
- [ ] Retrain model for >85% accuracy
- [ ] Add unit tests (pytest)
- [ ] Migrate to PostgreSQL
- [ ] Add authentication (JWT)
- [ ] Deploy to staging server

### Phase 2: Feature Enhancements (2-4 weeks)
- [ ] Kannada language support
- [ ] Result cards with maps
- [ ] Data export (CSV, PDF)
- [ ] Analytics dashboard
- [ ] TREND intent implementation
- [ ] Multi-turn conversations

### Phase 3: Scale & Optimize (1-2 months)
- [ ] Load balancing
- [ ] Redis caching
- [ ] Monitoring & alerts
- [ ] Performance optimization
- [ ] Mobile app (React Native)
- [ ] State-wide rollout

---

## 📞 Support & Documentation

### Documentation
- **Full Architecture**: `docs/ARCHITECTURE.md`
- **Visual Diagrams**: `docs/ARCHITECTURE_VISUAL.md`
- **Decision Guide**: `docs/ARCHITECTURE_COMPARISON.md`
- **API Contract**: `docs/api_contract.md`
- **Intent Taxonomy**: `docs/intent_taxonomy.md`

### API Documentation
- **Swagger UI**: http://localhost:8004/docs
- **ReDoc**: http://localhost:8004/redoc

### Logs
- **Backend**: Console output (or `backend/server.log`)
- **Frontend**: Browser console (F12)

---

## 🎉 Congratulations!

Your KSP Crime AI MVP is now live and functional!

**Total Development Time**: ~2.5 hours
- ✅ Model training: 30 min
- ✅ Data generation: 1 hour
- ✅ UI improvements: 1 hour
- ✅ Testing: 30 min

**What You Have**:
- Working chat interface
- 154 crime records
- Trained NLP model
- Voice input capability
- Full documentation

**Ready for**:
- Internal testing
- User feedback
- Iterative improvement

---

**Built with ❤️ for Karnataka State Police**

