# KSP Crime AI - Troubleshooting Guide

## Issue: Text Overlapping / Garbled Display ✅ FIXED

### What was happening:
- Message text was overlapping
- Text not wrapping correctly
- UI elements misaligned

### Solution Applied:
1. ✅ Added proper CSS reset in `index.css`
2. ✅ Fixed message bubble styles (word-wrap, white-space, overflow)
3. ✅ Added box-sizing: border-box globally
4. ✅ Fixed layout overflow issues

### To apply the fix:

**The frontend needs to reload to pick up changes:**

1. In your browser, press `Ctrl + Shift + R` (hard refresh)
   - OR press `F5` to reload
   - OR close and reopen the browser tab

2. If that doesn't work, restart the frontend:
   ```bash
   # In the terminal where frontend is running:
   # Press Ctrl+C to stop
   
   # Then restart:
   npm start
   ```

---

## Issue: "Couldn't connect to server" ✅ RESOLVED

### Status:
Backend IS running correctly! The error was from a previous query.

### How to verify backend is working:

1. **Check backend status:**
   ```bash
   # Open http://localhost:8004/health in browser
   # Should return: {"status":"healthy","database":"connected"}
   ```

2. **Check backend console:**
   - You should see: `INFO: Uvicorn running on http://0.0.0.0:8004`
   - When you submit queries, you'll see: `POST /api/chat HTTP/1.1" 200 OK`

### If backend is not running:

```bash
cd backend
python main.py
```

---

## Common Issues & Solutions

### 1. Port Already in Use

**Error**: `Address already in use: 8004`

**Solution**:
```bash
# Windows - Find and kill process on port 8004
netstat -ano | findstr :8004
taskkill /PID <process_id> /F

# Then restart backend
python main.py
```

### 2. Module Not Found Errors

**Error**: `ModuleNotFoundError: No module named 'X'`

**Solution**:
```bash
cd backend
pip install -r requirements.txt
```

### 3. Database Not Found

**Error**: `no such table: crimes`

**Solution**:
```bash
cd backend
python generate_sample_data.py
```

### 4. Model Not Found

**Error**: `Model file not found: models/intent_en.joblib`

**Solution**:
```bash
cd backend
python src\nlp\train_model.py
```

### 5. Frontend Build Errors

**Error**: `Module not found` or `Cannot find module`

**Solution**:
```bash
cd frontend
rm -rf node_modules
npm install
npm start
```

### 6. Voice Button Not Working

**Issue**: Click microphone but nothing happens

**Solutions**:
- Use Chrome or Edge (best Web Speech API support)
- Grant microphone permissions when browser asks
- Check browser console (F12) for errors
- Try on a different browser

### 7. CORS Errors

**Error**: `Access-Control-Allow-Origin` error in console

**Solution**:
Backend already has CORS configured. If you still see errors:
1. Make sure backend is running on port 8004
2. Make sure frontend is accessing `http://localhost:8004`
3. Hard refresh browser (Ctrl+Shift+R)

### 8. Slow Response Times

**Issue**: Queries take >2 seconds

**Solutions**:
- Check if database has proper indexes
- Restart backend
- Check if other applications are using CPU/memory
- Verify query returns reasonable result count (<100)

---

## How to Clear Everything and Start Fresh

If nothing works, here's the nuclear option:

```bash
# 1. Stop all running services
# Press Ctrl+C in both backend and frontend terminals

# 2. Backend reset
cd backend
rm ksp_crime_ai.db
rm -rf models
python src\nlp\train_model.py
python generate_sample_data.py
python main.py

# 3. Frontend reset (in new terminal)
cd frontend
rm -rf node_modules
npm install
npm start
```

---

## Quick Health Check

Run this checklist to verify everything is working:

### Backend Health Check
- [ ] Backend terminal shows "Uvicorn running on http://0.0.0.0:8004"
- [ ] http://localhost:8004/health returns JSON
- [ ] http://localhost:8004/docs shows Swagger UI
- [ ] File `backend/ksp_crime_ai.db` exists
- [ ] File `backend/models/intent_en.joblib` exists

### Frontend Health Check
- [ ] Frontend terminal shows "Compiled successfully"
- [ ] Browser opens to http://localhost:3000
- [ ] Header shows "KSP Crime AI"
- [ ] Input field is visible at bottom
- [ ] Microphone button is visible
- [ ] Welcome message is displayed

### Functionality Check
- [ ] Can type a query and press Enter
- [ ] Loading indicator appears
- [ ] Results appear in chat
- [ ] Can click microphone and speak
- [ ] Voice is recognized and submitted
- [ ] Multiple queries work in sequence

---

## Browser Console Errors

### How to check browser console:
1. Press `F12` in your browser
2. Click "Console" tab
3. Look for errors (red text)

### Common console errors:

**Error**: `Failed to fetch`
- **Cause**: Backend not running or wrong URL
- **Fix**: Verify backend is at http://localhost:8004

**Error**: `NetworkError`
- **Cause**: CORS or connection issue
- **Fix**: Restart backend, hard refresh browser

**Error**: `SpeechRecognition is not defined`
- **Cause**: Browser doesn't support Web Speech API
- **Fix**: Use Chrome or Edge

---

## Testing After Fix

Try these queries to verify everything works:

1. ✅ **"Show crimes in Bengaluru"**
   - Should return 30+ crimes
   - Results display in separate lines

2. ✅ **"How many thefts in Mysuru"**
   - Should return count
   - Text should be clear and readable

3. ✅ **Click 🎤 and say "Show crimes in Mangaluru"**
   - Voice should be recognized
   - Query auto-submits
   - Results appear

4. ✅ **"Invalid query test"** (type "hello")
   - Should show error message
   - Error message should be readable

---

## Still Having Issues?

### Check Backend Logs
Look at the terminal where backend is running for errors:
- `400 Bad Request` - Query validation failed (expected)
- `500 Internal Server Error` - Backend error (needs fixing)
- `200 OK` - Successful query

### Check Frontend Console
Press F12 in browser and look for:
- Red errors in Console tab
- Network tab showing failed requests
- Response data from API calls

### Need More Help?

1. **Check the logs**: Both backend terminal and browser console
2. **Verify all files exist**: Model, database, node_modules
3. **Restart everything**: Backend and frontend
4. **Try incognito mode**: Sometimes browser cache causes issues

---

## Quick Fix Summary

**For the text overlap issue** (what you saw):

1. **Hard refresh browser**: `Ctrl + Shift + R`
2. **Or restart frontend**:
   ```bash
   # Stop with Ctrl+C, then:
   cd frontend
   npm start
   ```

That's it! The CSS fixes have been applied. Just refresh your browser.

---

## Contact

If issues persist:
- Check `backend/server.log` for errors
- Check browser console (F12) for frontend errors
- Review `QUICK_START.md` for setup instructions
- Review `MVP_COMPLETION_REPORT.md` for system overview

