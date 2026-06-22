# KSP Crime AI - Complete Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture Pattern](#architecture-pattern)
3. [Technology Stack](#technology-stack)
4. [Component Architecture](#component-architecture)
5. [Data Flow](#data-flow)
6. [Database Design](#database-design)
7. [API Design](#api-design)
8. [NLP Pipeline](#nlp-pipeline)
9. [Security Architecture](#security-architecture)
10. [Deployment Architecture](#deployment-architecture)
11. [Scalability Considerations](#scalability-considerations)
12. [Future Enhancements](#future-enhancements)

---

## 1. System Overview

### Purpose
KSP Crime AI is a conversational interface that enables Karnataka State Police (KSP) officers to query crime databases using natural language in English or Kannada, optimized for tablet use with voice input capabilities.

### Key Goals
- **Accessibility**: Low-literacy friendly interface with voice support
- **Security**: Prevent SQL injection with parameterized queries
- **Accountability**: Comprehensive audit logging
- **Offline-First**: No external API dependencies
- **Performance**: Fast response times (<2s per query)

### Target Users
- Police officers in Karnataka
- Field officers with limited technical expertise
- Tablet users (primary interface)

---

## 2. Architecture Pattern

### Pattern: Monolithic MVP with Modular Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA (TypeScript)                                   │   │
│  │  - ChatPage Component                                     │   │
│  │  - Web Speech API Integration                             │   │
│  │  - Responsive Tablet UI                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                         HTTP/JSON
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      API LAYER (FastAPI)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /api/chat                                           │   │
│  │  - CORS Middleware                                        │   │
│  │  - Request Validation                                     │   │
│  │  - Error Handling                                         │   │
│  │  - Audit Logging                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NLP PIPELINE LAYER                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Intent Classifier                                        │   │
│  │  - TF-IDF Vectorizer                                      │   │
│  │  - Logistic Regression                                    │   │
│  │  - Confidence Thresholding                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Entity Extractor                                         │   │
│  │  - Location (regex + dictionary)                          │   │
│  │  - Date Range (temporal parsing)                          │   │
│  │  - Crime Type (mapping)                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   QUERY ENGINE LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQL Translator                                           │   │
│  │  - Intent → SQL mapping                                   │   │
│  │  - Parameterized query generation                         │   │
│  │  - Input sanitization                                     │   │
│  │  - Query validation                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQLAlchemy ORM                                           │   │
│  │  - Crime Model                                            │   │
│  │  - District Model                                         │   │
│  │  - PoliceStation Model                                    │   │
│  │  - CrimeType Model                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  SQLite Database (Dev) / PostgreSQL (Prod)               │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Why Monolithic for MVP?
1. **Simplicity**: Single codebase, easier debugging
2. **Fast Development**: No inter-service communication overhead
3. **Lower Infrastructure Cost**: Single deployment
4. **Sufficient for Scale**: Can handle 100-1000 concurrent users

### Future Migration Path (Post-MVP)
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  API Gateway│────▶│ Auth Service│
│   (React)   │     │  (FastAPI)  │     └─────────────┘
└─────────────┘     └─────────────┘             │
                           │                     │
                ┌──────────┴──────────┐         │
                ▼                     ▼         ▼
        ┌─────────────┐      ┌─────────────┐  ┌─────────────┐
        │ NLP Service │      │Query Service│  │Audit Service│
        │  (Python)   │      │  (FastAPI)  │  │  (Python)   │
        └─────────────┘      └─────────────┘  └─────────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │   PostgreSQL    │
                            │   + TimescaleDB │
                            └─────────────────┘
```

---

## 3. Technology Stack

### Backend
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Web Framework** | FastAPI | 0.104.1 | REST API, async support, auto docs |
| **ASGI Server** | Uvicorn | 0.24.0 | Production-grade server |
| **ORM** | SQLAlchemy | 2.0.50 | Database abstraction |
| **Database (Dev)** | SQLite | 3.x | Development database |
| **Database (Prod)** | PostgreSQL | 12+ | Production database |
| **ML Framework** | scikit-learn | 1.5.0+ | Intent classification |
| **Vectorization** | TF-IDF | - | Text to numerical features |
| **Model Persistence** | joblib | 1.4.2 | Save/load trained models |
| **Migration Tool** | Alembic | 1.13.1 | Database migrations |

### Frontend
| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **UI Library** | React | 18.2.0 | Component-based UI |
| **Language** | TypeScript | 4.x | Type safety |
| **Build Tool** | react-scripts | 5.0.1 | Build & dev server |
| **Voice Input** | Web Speech API | Native | Browser-based speech recognition |
| **HTTP Client** | Fetch API | Native | API communication |

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| **Version Control** | Git | Code versioning |
| **Package Manager (Python)** | pip | Python dependencies |
| **Package Manager (Node)** | npm | JavaScript dependencies |
| **Container (Future)** | Docker | Containerization |
| **Reverse Proxy (Future)** | Nginx | Load balancing |

---

## 4. Component Architecture

### 4.1 Backend Components

#### A. API Layer (`src/api/`)
```python
src/api/
├── routes/
│   └── chat.py          # POST /api/chat endpoint
│       ├── Request validation
│       ├── NLP service orchestration
│       ├── Query execution
│       └── Response formatting
└── __init__.py
```

**Responsibilities:**
- HTTP request/response handling
- Input validation
- Error handling (400, 500)
- CORS middleware
- Audit logging trigger

**Key Design Decisions:**
- Uses FastAPI's dependency injection for database sessions
- Async/await for non-blocking I/O
- Structured error responses with status codes

#### B. NLP Pipeline (`src/nlp/`)
```python
src/nlp/
├── intent_classifier.py    # Intent classification
│   ├── IntentClassifier class
│   ├── TF-IDF vectorization
│   ├── Logistic Regression
│   └── Entity extraction
├── train_model.py          # Model training script
└── models/
    └── intent_en.joblib    # Trained model
```

**Responsibilities:**
- Text preprocessing (lowercase, punctuation removal)
- Intent classification (SHOW_CRIMES, COUNT_CRIMES, UNKNOWN)
- Entity extraction:
  - Location (regex + dictionary matching)
  - Date range (temporal parsing)
  - Crime type (keyword mapping)
- Confidence scoring

**Key Design Decisions:**
- TF-IDF for feature extraction (lightweight, fast)
- Logistic Regression for classification (interpretable, fast training)
- Rule-based entity extraction (deterministic, no training needed)
- Confidence threshold: 0.3 (below = UNKNOWN)

**Entity Extraction Examples:**
```python
# Location extraction
"crimes in Bengaluru" → location: "Bengaluru"
"near MG Road" → location: "MG Road"

# Date range extraction
"last month" → {start: "2024-05-22", end: "2024-06-22"}
"in 2023" → {start: "2023-01-01", end: "2023-12-31"}

# Crime type extraction
"theft cases" → crime_type: "Theft"
"murder incidents" → crime_type: "Murder"
```

#### C. Query Engine (`src/query_engine/`)
```python
src/query_engine/
└── translator.py           # SQL translation
    ├── QueryTranslator class
    ├── Intent → SQL mapping
    ├── Parameterized query generation
    └── Input validation
```

**Responsibilities:**
- Convert NLP output to parameterized SQL
- SQL injection prevention
- Query validation
- Result set limiting (max 100 records)

**Key Design Decisions:**
- Parameterized queries using `:named` parameters
- Case-insensitive matching with LOWER() + LIKE
- Denormalized schema for faster queries
- Hard-coded result limits

**SQL Generation Examples:**
```sql
-- SHOW_CRIMES with location and date
SELECT * FROM crimes 
WHERE LOWER(district) LIKE LOWER(:loc) 
  AND date_occurred >= :start 
  AND date_occurred <= :end 
LIMIT :limit

-- COUNT_CRIMES with crime type
SELECT COUNT(*) FROM crimes 
WHERE LOWER(crime_type) LIKE LOWER(:ctype)
```

#### D. Database Layer (`src/database/`)
```python
src/database/
├── models.py               # SQLAlchemy models
│   ├── Crime
│   ├── District
│   ├── PoliceStation
│   └── CrimeType
├── session.py              # Session management
│   ├── Engine creation
│   ├── SessionLocal factory
│   └── get_db() dependency
├── seeds.py                # Seed data
└── __init__.py
```

**Responsibilities:**
- ORM model definitions
- Database connection pooling
- Session lifecycle management
- Database initialization and seeding

**Key Design Decisions:**
- SQLite for development (zero config)
- PostgreSQL for production (better performance)
- Denormalized Crime table (district, crime_type as strings)
- Connection pooling with StaticPool (SQLite) or default (Postgres)

### 4.2 Frontend Components

#### Component Tree
```
ChatPage (Container)
├── MessageList
│   └── MessageBubble[] (Presentational)
│       ├── UserMessage
│       └── BotMessage
├── InputArea
│   ├── InputField (Text input)
│   ├── SendButton
│   └── VoiceButton (Web Speech API)
└── LoadingIndicator
```

**Component Responsibilities:**

| Component | Purpose | State Management |
|-----------|---------|------------------|
| **ChatPage** | Main container, API calls | Local state (useState) |
| **MessageBubble** | Display single message | Props only |
| **InputField** | Text input handling | Local state |
| **VoiceButton** | Speech recognition | Web Speech API |

**Key Design Decisions:**
- Single-page application (no routing)
- Local state management (no Redux for MVP)
- Inline styles (no CSS framework for MVP)
- Auto-scroll to latest message
- Loading states for async operations

---

## 5. Data Flow

### 5.1 Request Flow (Happy Path)

```
┌─────────┐
│  User   │
└────┬────┘
     │ 1. Types/speaks query
     ▼
┌─────────────────┐
│   InputField    │  Text: "Show crimes in Bengaluru last month"
│   /VoiceButton  │
└────┬────────────┘
     │ 2. Submit query
     ▼
┌─────────────────┐
│   ChatPage      │  State: Add user message
└────┬────────────┘
     │ 3. POST /api/chat
     ▼
┌─────────────────────────────────────────────────────────┐
│   Backend: POST /api/chat                                │
└────┬────────────────────────────────────────────────────┘
     │ 4. Extract request data
     ▼
┌─────────────────────────────────────────────────────────┐
│   NLP Service: intent_classifier.py                     │
│   Input: "Show crimes in Bengaluru last month"          │
│   Output: {                                              │
│     intent: "SHOW_CRIMES",                               │
│     confidence: 0.89,                                    │
│     entities: {                                          │
│       location: "Bengaluru",                             │
│       date_range: {start: "2024-05-22", end: "2024-06-22"}│
│     }                                                    │
│   }                                                      │
└────┬────────────────────────────────────────────────────┘
     │ 5. NLP output
     ▼
┌─────────────────────────────────────────────────────────┐
│   Query Engine: translator.py                           │
│   SQL: SELECT * FROM crimes                              │
│        WHERE LOWER(district) LIKE LOWER(:loc)           │
│        AND date_occurred >= :start                       │
│        AND date_occurred <= :end                         │
│        LIMIT :limit                                      │
│   Params: {                                              │
│     loc: "%Bengaluru%",                                  │
│     start: "2024-05-22",                                 │
│     end: "2024-06-22",                                   │
│     limit: 100                                           │
│   }                                                      │
└────┬────────────────────────────────────────────────────┘
     │ 6. SQL + params
     ▼
┌─────────────────────────────────────────────────────────┐
│   Database: SQLAlchemy + SQLite/PostgreSQL              │
│   Execute query, return results                          │
└────┬────────────────────────────────────────────────────┘
     │ 7. Query results (list of crime records)
     ▼
┌─────────────────────────────────────────────────────────┐
│   API Layer: Format response                             │
│   {                                                      │
│     answer: "Here are the first 3 crimes:",              │
│     sql: "SELECT * FROM crimes WHERE...",                │
│     results: [                                           │
│       {id: 1, fir_number: "FIR001", ...},                │
│       {id: 2, fir_number: "FIR002", ...}                 │
│     ],                                                   │
│     error: null                                          │
│   }                                                      │
└────┬────────────────────────────────────────────────────┘
     │ 8. HTTP 200 + JSON response
     ▼
┌─────────────────┐
│   ChatPage      │  State: Add bot message
└────┬────────────┘
     │ 9. Render bot response
     ▼
┌─────────┐
│  User   │  Sees: "Here are the first 3 crimes:"
└─────────┘
```

### 5.2 Error Flow

```
User Query → API → NLP (confidence < 0.3) → UNKNOWN intent
                                           ↓
                    Query Engine → ValueError: "Unsupported intent"
                                           ↓
                    API → HTTP 400 → Frontend shows fallback message
```

---

## 6. Database Design

### 6.1 Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────────┐
│    District     │         │   PoliceStation     │
├─────────────────┤         ├─────────────────────┤
│ id (PK)         │◄───────┤│ id (PK)             │
│ name            │    1:N  │ name                │
└─────────────────┘         │ district_id (FK)    │
                            │ taluk               │
                            └─────────────────────┘

┌─────────────────┐
│   CrimeType     │
├─────────────────┤
│ id (PK)         │
│ ipc_section     │
│ description     │
└─────────────────┘

┌──────────────────────────────────────┐
│            Crime (Main Table)        │
├──────────────────────────────────────┤
│ id (PK)                              │
│ fir_number (Unique)                  │
│ date_occurred                        │
│ district (Denormalized String)       │ ← Not FK for MVP
│ taluk (String)                       │
│ police_station (Denormalized String) │ ← Not FK for MVP
│ crime_type (Denormalized String)     │ ← Not FK for MVP
│ description (Text)                   │
│ latitude (Float)                     │
│ longitude (Float)                    │
└──────────────────────────────────────┘
```

### 6.2 Schema Details

#### Table: `crimes`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| fir_number | VARCHAR(50) | UNIQUE, NOT NULL | FIR identifier |
| date_occurred | DATE | NOT NULL | Crime date |
| district | VARCHAR(100) | | Location (denormalized) |
| taluk | VARCHAR(100) | | Sub-district |
| police_station | VARCHAR(100) | | Station name |
| crime_type | VARCHAR(100) | | Crime category |
| description | TEXT | | Crime details |
| latitude | FLOAT | | GPS coordinate |
| longitude | FLOAT | | GPS coordinate |

**Indexes:**
```sql
CREATE INDEX idx_district ON crimes(district);
CREATE INDEX idx_date ON crimes(date_occurred);
CREATE INDEX idx_crime_type ON crimes(crime_type);
CREATE INDEX idx_fir ON crimes(fir_number);
```

#### Table: `districts`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(100) | UNIQUE, NOT NULL | District name |

#### Table: `crime_types`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| ipc_section | VARCHAR(20) | UNIQUE, NOT NULL | IPC code |
| description | VARCHAR(500) | | Crime description |

#### Table: `police_stations`
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | VARCHAR(100) | NOT NULL | Station name |
| district_id | INTEGER | FOREIGN KEY | Reference to districts |
| taluk | VARCHAR(100) | | Sub-district |


### 6.3 Design Decisions

**Why Denormalized Crime Table?**

✅ **Pros:**
- Faster queries (no JOINs needed)
- Simpler NLP → SQL translation
- Better for MVP performance
- Easier to migrate data from legacy systems

❌ **Cons:**
- Data redundancy
- Update anomalies
- No referential integrity

**Trade-off:** For MVP with read-heavy workload and infrequent updates, denormalization is acceptable.

**Future Normalization:**
```sql
-- Phase 2: Add foreign keys
ALTER TABLE crimes ADD COLUMN district_id INTEGER REFERENCES districts(id);
ALTER TABLE crimes ADD COLUMN crime_type_id INTEGER REFERENCES crime_types(id);
ALTER TABLE crimes ADD COLUMN police_station_id INTEGER REFERENCES police_stations(id);

-- Keep denormalized fields for backward compatibility
```

---

## 7. API Design

### 7.1 Endpoint: POST /api/chat

**Request Schema:**
```json
{
  "text": "string (required, 1-1000 chars)",
  "language": "string (optional, 'en' | 'kn', default: 'en')",
  "sessionId": "string (optional, for chat history)"
}
```

**Response Schema (Success):**
```json
{
  "answer": "string (natural language response)",
  "sql": "string (debugging only, remove in prod)",
  "results": [
    {
      "id": 1,
      "fir_number": "FIR001",
      "date_occurred": "2023-05-15",
      "district": "Bengaluru Urban",
      "crime_type": "Theft",
      "description": "Mobile phone theft",
      "latitude": 13.1081,
      "longitude": 77.5874
    }
  ],
  "error": null
}
```

**Response Schema (Error):**
```json
{
  "answer": "Sorry, I couldn't process that.",
  "sql": null,
  "results": [],
  "error": "Either location or date_range must be provided"
}
```

**HTTP Status Codes:**
- `200 OK`: Successful request (even if no results)
- `400 Bad Request`: Invalid input (missing text, invalid format)
- `500 Internal Server Error`: Server error (database down, NLP failure)

### 7.2 Error Handling Strategy

```python
# Validation errors (400)
- Empty text field
- Text too long (>1000 chars)
- Invalid language code
- Malformed JSON

# Business logic errors (400)
- Unsupported intent
- Missing required entities
- Invalid date format

# Server errors (500)
- Database connection failure
- NLP model not loaded
- Unexpected exceptions
```

### 7.3 API Versioning (Future)
```
/api/v1/chat  ← Current
/api/v2/chat  ← Future: streaming responses, multi-turn
```

---

## 8. NLP Pipeline

### 8.1 Intent Classification Architecture

```
Input Text: "Show crimes in Bengaluru last month"
     │
     ▼
┌─────────────────────────────────────────┐
│  Text Preprocessing                     │
│  - Lowercase                            │
│  - Remove extra punctuation             │
│  - Remove extra whitespace              │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│  TF-IDF Vectorization                   │
│  - n-grams: (1, 2)                      │
│  - max_features: 5000                   │
│  - stop_words: English                  │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│  Logistic Regression Classification     │
│  - Multi-class: SHOW_CRIMES,            │
│                 COUNT_CRIMES,           │
│                 UNKNOWN                 │
│  - max_iter: 1000                       │
│  - random_state: 42                     │
└────────────┬────────────────────────────┘
             ▼
     Intent: SHOW_CRIMES
     Confidence: 0.89
```

### 8.2 Entity Extraction Pipeline

#### Location Extraction
```python
Patterns:
1. "in [location]"  → extract location
2. "at [location]"  → extract location
3. "near [location]" → extract location
4. Known cities dictionary → match substring

Examples:
"crimes in Bengaluru" → "Bengaluru"
"near MG Road" → "MG Road"
"Mysuru thefts" → "Mysuru"
```

#### Date Range Extraction
```python
Temporal Patterns:
1. "last month"    → {start: now-30d, end: now}
2. "last week"     → {start: now-7d, end: now}
3. "yesterday"     → {start: now-1d, end: now-1d}
4. "in 2023"       → {start: 2023-01-01, end: 2023-12-31}
5. "in [month]"    → {start: YYYY-MM-01, end: YYYY-MM-31}

Examples:
"last month" → {start: "2024-05-22", end: "2024-06-22"}
"in 2023" → {start: "2023-01-01", end: "2023-12-31"}
```

#### Crime Type Extraction
```python
Crime Type Mapping:
{
  "theft": "379",
  "murder": "302",
  "snatching": "356",
  "robbery": "392",
  "assault": "351",
  "burglary": "454"
}

Variations:
"theft" → also matches: "steal", "stolen"
"murder" → also matches: "kill", "homicide"
"snatching" → also matches: "snatch"
```

### 8.3 Training Data Structure

```python
Training Set:
- SHOW_CRIMES: 20 samples
- COUNT_CRIMES: 20 samples
- UNKNOWN: 20 samples
Total: 60 samples (MVP)

Recommended (Production):
- SHOW_CRIMES: 200+ samples
- COUNT_CRIMES: 200+ samples
- UNKNOWN: 100+ samples
Total: 500+ samples
```

### 8.4 Model Performance Metrics (Target)

| Metric | Target | Current (Estimated) |
|--------|--------|---------------------|
| **Accuracy** | >85% | ~70% (small dataset) |
| **Precision** | >80% | ~65% |
| **Recall** | >80% | ~65% |
| **F1 Score** | >80% | ~65% |
| **Inference Time** | <100ms | ~50ms |

**Improvement Plan:**
1. Collect more training data (500+ samples)
2. Add data augmentation (synonyms, paraphrasing)
3. Implement active learning loop
4. Add confusion matrix analysis

---

## 9. Security Architecture

### 9.1 Threat Model

| Threat | Mitigation | Priority |
|--------|------------|----------|
| **SQL Injection** | Parameterized queries | CRITICAL |
| **XSS Attacks** | React auto-escaping | HIGH |
| **CSRF** | SameSite cookies (future) | MEDIUM |
| **DDoS** | Rate limiting (future) | MEDIUM |
| **Data Exposure** | Audit logging | HIGH |
| **Unauthorized Access** | Auth layer (future) | HIGH |

### 9.2 SQL Injection Prevention

**Architecture:**
```python
# ❌ UNSAFE (vulnerable to injection)
sql = f"SELECT * FROM crimes WHERE district = '{user_input}'"
db.execute(sql)

# ✅ SAFE (parameterized)
sql = "SELECT * FROM crimes WHERE district = :district"
params = {"district": user_input}
db.execute(text(sql), params)
```

**Additional Layers:**
1. Input validation (reject special SQL characters)
2. Query allowlist (only SHOW_CRIMES, COUNT_CRIMES)
3. Result set limits (max 100 rows)
4. Read-only database user (future)


### 9.3 Audit Logging

**What to Log:**
```python
{
  "timestamp": "2024-06-22T10:30:00Z",
  "user_id": "officer_123",  # Future: from auth
  "session_id": "abc123",
  "query_text": "show crimes in bengaluru",
  "intent": "SHOW_CRIMES",
  "confidence": 0.89,
  "sql_generated": "SELECT * FROM crimes WHERE...",
  "result_count": 5,
  "response_time_ms": 150,
  "error": null
}
```

**Storage:**
- Development: Console logs
- Production: Database table + file rotation
- Retention: 90 days (configurable)

### 9.4 Authentication (Future Phase)

```
┌─────────┐     ┌──────────┐     ┌─────────┐
│  User   │────▶│  Login   │────▶│  JWT    │
│ Officer │     │  (LDAP)  │     │  Token  │
└─────────┘     └──────────┘     └────┬────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │  API Request    │
                              │  (Authorization │
                              │   header)       │
                              └─────────────────┘
```

---

## 10. Deployment Architecture

### 10.1 Development Environment

```
Developer Machine
├── Backend: http://localhost:8004
│   ├── Python 3.8+
│   ├── SQLite database
│   └── Uvicorn server
└── Frontend: http://localhost:3000
    ├── Node.js 16+
    ├── React dev server
    └── Hot module replacement
```

**Setup Commands:**
```bash
# Backend
cd backend
pip install -r requirements.txt
python init_db.py
python main.py

# Frontend
cd frontend
npm install
npm start
```

### 10.2 Production Environment (Single Server MVP)

```
                    Internet
                       │
                       ▼
              ┌──────────────────┐
              │   Nginx          │  Port 80/443
              │   (Reverse Proxy)│
              └────────┬─────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌───────────────┐            ┌────────────────┐
│  React Build  │            │  Uvicorn       │
│  (Static)     │            │  (FastAPI)     │
│  Port: serve  │            │  Port: 8004    │
└───────────────┘            └────────┬───────┘
                                      │
                                      ▼
                             ┌────────────────┐
                             │  PostgreSQL    │
                             │  Port: 5432    │
                             └────────────────┘
```

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name ksp-crime-ai.gov.in;

    # Frontend (static files)
    location / {
        root /var/www/ksp-crime-ai/frontend/build;
        try_files $uri /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 10.3 Docker Deployment (Alternative)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8004:8004"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/ksp_crime_ai
    depends_on:
      - db

  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    depends_on:
      - backend

  db:
    image: postgres:12
    environment:
      - POSTGRES_USER=ksp_user
      - POSTGRES_PASSWORD=secure_password
      - POSTGRES_DB=ksp_crime_ai
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

### 10.4 Cloud Deployment Options

#### Option A: AWS
```
Route 53 (DNS)
    ↓
CloudFront (CDN) → S3 (Frontend static files)
    ↓
ALB (Load Balancer)
    ↓
EC2/ECS (Backend containers)
    ↓
RDS PostgreSQL (Database)
```

#### Option B: Azure
```
Azure DNS
    ↓
Azure CDN → Blob Storage (Frontend)
    ↓
Application Gateway
    ↓
App Service / AKS (Backend)
    ↓
Azure Database for PostgreSQL
```

#### Option C: On-Premise (Recommended for Government)
```
Physical Servers (Karnataka Data Center)
    ↓
Load Balancer (HAProxy)
    ↓
Application Servers (VM/Bare Metal)
    ↓
PostgreSQL Cluster (Primary + Replica)
```

---

## 11. Scalability Considerations

### 11.1 Current Capacity (MVP)

| Metric | Capacity | Bottleneck |
|--------|----------|------------|
| **Concurrent Users** | ~100 | Database connections |
| **Requests/Second** | ~50 | Single server CPU |
| **Database Size** | 10 GB | SQLite file system |
| **Response Time** | <2s | NLP inference + query |

### 11.2 Scaling Strategy

#### Phase 1: Vertical Scaling (0-1000 users)
```
Current: 2 CPU, 4 GB RAM
    ↓
Upgrade: 8 CPU, 16 GB RAM

- Increase database connection pool
- Add Redis caching layer
- Optimize SQL indexes
```

#### Phase 2: Horizontal Scaling (1000-10000 users)
```
            Load Balancer
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
     API-1    API-2    API-3
        │        │        │
        └────────┼────────┘
                 ▼
          PostgreSQL Primary
                 │
          ┌──────┴──────┐
          ▼             ▼
      Replica-1     Replica-2
```

**Changes:**
- Stateless API servers (no session state)
- Redis for session storage
- PostgreSQL read replicas
- Separate NLP service (optional)

#### Phase 3: Microservices (10000+ users)
```
API Gateway
    │
    ├─▶ Auth Service
    ├─▶ NLP Service (gRPC)
    ├─▶ Query Service
    ├─▶ Audit Service
    └─▶ Analytics Service
         │
         ▼
    TimescaleDB (time-series)
```

### 11.3 Caching Strategy

```python
# Cache layers
┌────────────────────────────────┐
│  Browser Cache (Frontend)     │  TTL: 5 min
└────────────────────────────────┘
              ↓
┌────────────────────────────────┐
│  Redis (API responses)         │  TTL: 1 min
└────────────────────────────────┘
              ↓
┌────────────────────────────────┐
│  PostgreSQL (Query cache)      │  Built-in
└────────────────────────────────┘
```

**Cache Keys:**
```python
# Example cache key
key = f"query:{intent}:{location}:{date_range}:{crime_type}"
# query:SHOW_CRIMES:Bengaluru:2023-01-01_2023-12-31:Theft
```

---

## 12. Future Enhancements

### 12.1 Kannada Language Support

**Implementation Plan:**
```
Phase 1: Data Collection
- Collect 500+ Kannada queries
- Translate intent labels
- Create Kannada training set

Phase 2: Model Training
- Train separate Kannada model (intent_kn.joblib)
- Or use multilingual model (mBERT)

Phase 3: Language Detection
- Auto-detect English vs Kannada
- Unicode range detection (U+0C80 to U+0CFF)

Phase 4: UI Updates
- Kannada labels and messages
- Font support (Noto Sans Kannada)
```

### 12.2 Advanced NLP Features

#### Named Entity Recognition (NER)
```
Current: Rule-based regex
Future: spaCy NER model

"Show crimes near Koramangala 5th Block in January"
    ↓
Entities:
- LOCATION: "Koramangala 5th Block"
- DATE: "January 2024"
```

#### Intent: TREND Analysis
```
Query: "What's the trend of thefts in Bengaluru?"
    ↓
SQL: 
SELECT 
  DATE_TRUNC('month', date_occurred) as month,
  COUNT(*) as count
FROM crimes
WHERE district ILIKE :loc AND crime_type ILIKE :ctype
GROUP BY month
ORDER BY month;
    ↓
Response: Line chart showing monthly trend
```

#### Multi-Turn Conversations
```
User: "Show crimes in Bengaluru"
Bot: "Found 50 crimes. Would you like to filter by date or type?"
User: "Last month only"
Bot: [Applies filter to previous context]
```

### 12.3 UI/UX Enhancements

#### Crime Results Display
```typescript
// Current: Plain text response
answer: "Here are the first 3 crimes:"

// Future: Structured cards
<CrimeCard>
  <Header>
    <FirNumber>FIR001</FirNumber>
    <Date>May 15, 2023</Date>
  </Header>
  <Body>
    <CrimeType>Theft</CrimeType>
    <Location>Bengaluru Urban</Location>
    <Description>Mobile phone theft...</Description>
  </Body>
  <Footer>
    <MapButton lat={13.1081} lng={77.5874} />
    <DetailsButton />
  </Footer>
</CrimeCard>
```

#### Map Integration
```javascript
// Show crimes on interactive map
<Map center={[lat, lng]} zoom={12}>
  {crimes.map(crime => (
    <Marker
      position={[crime.latitude, crime.longitude]}
      popup={crime.description}
    />
  ))}
</Map>
```

#### Data Export
```typescript
// Export query results
<ExportButton 
  formats={['CSV', 'PDF', 'Excel']}
  data={queryResults}
  filename="crime_report_20240622"
/>
```

### 12.4 Analytics Dashboard

```
┌─────────────────────────────────────────────────┐
│  KSP Crime Analytics Dashboard                  │
├─────────────────────────────────────────────────┤
│  Total Crimes: 1,234    This Month: 156         │
│                                                  │
│  [Crime Trend Chart - Last 6 months]            │
│  ─────────────────────────────────              │
│           ╱╲                                     │
│          ╱  ╲      ╱╲                           │
│    ╱╲   ╱    ╲    ╱  ╲                          │
│   ╱  ╲─╱      ╲──╱    ╲                         │
│  ╱                      ╲                        │
│                                                  │
│  Top Crime Types:        Hot Zones:             │
│  1. Theft (40%)          1. Bengaluru Urban     │
│  2. Snatching (25%)      2. Mysuru              │
│  3. Burglary (15%)       3. Belagavi            │
│                                                  │
│  [Heat Map]              [Query Usage Stats]    │
└─────────────────────────────────────────────────┘
```

### 12.5 Mobile App

**React Native Implementation:**
```
iOS/Android App
├── Same API backend
├── Offline mode (SQLite cache)
├── GPS-based location
├── Push notifications
└── Camera integration (FIR scanning)
```

---

## 13. Testing Strategy

### 13.1 Backend Testing

#### Unit Tests
```python
# tests/test_intent_classifier.py
def test_show_crimes_intent():
    classifier = IntentClassifier()
    intent, confidence = classifier.predict("show crimes in bengaluru")
    assert intent == "SHOW_CRIMES"
    assert confidence > 0.7

# tests/test_translator.py
def test_sql_generation():
    translator = QueryTranslator()
    nlp_output = {
        "intent": "SHOW_CRIMES",
        "entities": {"location": "Bengaluru"}
    }
    sql, params = translator.translate(nlp_output)
    assert "SELECT * FROM crimes" in sql
    assert params["loc"] == "%Bengaluru%"
```

#### Integration Tests
```python
# tests/test_api.py
def test_chat_endpoint(client, db):
    response = client.post("/api/chat", json={
        "text": "show crimes in bengaluru last month",
        "language": "en"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["error"] is None
    assert len(data["results"]) > 0
```

### 13.2 Frontend Testing

```typescript
// tests/ChatPage.test.tsx
describe('ChatPage', () => {
  test('renders input field', () => {
    render(<ChatPage />);
    expect(screen.getByPlaceholderText(/ask about crimes/i)).toBeInTheDocument();
  });

  test('submits query and displays response', async () => {
    render(<ChatPage />);
    const input = screen.getByPlaceholderText(/ask about crimes/i);
    fireEvent.change(input, { target: { value: 'show crimes' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    
    await waitFor(() => {
      expect(screen.getByText(/crimes/i)).toBeInTheDocument();
    });
  });
});
```

### 13.3 End-to-End Testing

```javascript
// e2e/chat.spec.js (Playwright/Cypress)
test('complete query flow', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.fill('input[type="text"]', 'show crimes in bengaluru');
  await page.click('button[type="submit"]');
  await expect(page.locator('.message-bubble')).toContainText('crimes');
});
```

---

## 14. Performance Optimization

### 14.1 Database Optimizations

```sql
-- Index usage
EXPLAIN ANALYZE 
SELECT * FROM crimes 
WHERE LOWER(district) LIKE LOWER('%Bengaluru%');

-- Query optimization
-- Before: 500ms
SELECT * FROM crimes WHERE district = 'Bengaluru Urban';

-- After: 50ms (with index)
CREATE INDEX idx_district_lower ON crimes (LOWER(district));
```

### 14.2 API Optimizations

```python
# Response compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Connection pooling
engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=40,
    pool_timeout=30
)

# Async endpoints
@router.post("/chat")
async def chat_endpoint(...):
    # Non-blocking I/O
```

### 14.3 Frontend Optimizations

```typescript
// Code splitting
const ChatPage = lazy(() => import('./pages/ChatPage'));

// Debounce input
const debouncedSubmit = useMemo(
  () => debounce(handleSubmit, 300),
  []
);

// Virtual scrolling for large result sets
<VirtualList
  items={messages}
  itemHeight={80}
  renderItem={(message) => <MessageBubble {...message} />}
/>
```

---

## 15. Monitoring & Observability

### 15.1 Metrics to Track

```python
# Application metrics
- Requests per second
- Average response time
- Error rate (4xx, 5xx)
- NLP inference time
- Database query time

# Business metrics
- Queries per day
- Top intents
- Top locations queried
- Low confidence queries (for improvement)
```

### 15.2 Logging Strategy

```python
# Structured logging
import logging
import json

logger.info(json.dumps({
    "event": "query_processed",
    "user_id": "officer_123",
    "intent": "SHOW_CRIMES",
    "confidence": 0.89,
    "response_time_ms": 150,
    "result_count": 5
}))
```

### 15.3 Alerting

```yaml
alerts:
  - name: High Error Rate
    condition: error_rate > 5%
    duration: 5m
    action: notify_admin
    
  - name: Slow Response
    condition: p95_latency > 3s
    duration: 10m
    action: notify_devops
    
  - name: Low Confidence Queries
    condition: low_confidence_rate > 30%
    duration: 1h
    action: notify_ml_team
```

---

## 16. Compliance & Data Privacy

### 16.1 Data Classification

| Data Type | Sensitivity | Retention |
|-----------|-------------|-----------|
| Crime Records | High | 7 years |
| User Queries | Medium | 90 days |
| Audit Logs | High | 3 years |
| Session Data | Low | 24 hours |


### 16.2 Access Control (Future)

```
Role-Based Access Control (RBAC)

Roles:
1. Admin
   - Full access
   - User management
   - System configuration

2. Officer
   - Query crimes
   - View results
   - Export reports

3. Analyst
   - Query crimes
   - View analytics
   - No export (read-only)

4. Guest
   - Limited queries
   - No sensitive data
```

### 16.3 Data Anonymization

```python
# For analytics/reporting
def anonymize_crime_data(crime):
    return {
        "date": crime.date_occurred.strftime("%Y-%m"),  # Month only
        "district": crime.district,
        "crime_type": crime.crime_type,
        # Remove: fir_number, description, exact location
    }
```

---

## 17. Migration Plan (SQLite → PostgreSQL)

### 17.1 Data Migration

```bash
# Step 1: Export from SQLite
sqlite3 ksp_crime_ai.db .dump > dump.sql

# Step 2: Convert SQLite SQL to PostgreSQL
# (Handle AUTOINCREMENT → SERIAL, etc.)

# Step 3: Import to PostgreSQL
psql -U ksp_user -d ksp_crime_ai -f dump_postgres.sql

# Step 4: Update connection string
export DATABASE_URL="postgresql://ksp_user:pass@localhost:5432/ksp_crime_ai"

# Step 5: Run migrations
alembic upgrade head

# Step 6: Verify data integrity
python verify_migration.py
```

### 17.2 Zero-Downtime Migration

```
1. Set up PostgreSQL replica
2. Enable dual-write (SQLite + PostgreSQL)
3. Verify data consistency
4. Switch read traffic to PostgreSQL
5. Disable SQLite writes
6. Decommission SQLite
```

---

## 18. Cost Estimation

### 18.1 Development Costs (MVP)

| Item | Time | Cost |
|------|------|------|
| Backend Development | 40 hours | - |
| Frontend Development | 30 hours | - |
| NLP Model Training | 10 hours | - |
| Testing & QA | 20 hours | - |
| **Total** | **100 hours** | **~$10,000** |


### 18.2 Infrastructure Costs (Monthly, AWS)

| Service | Specification | Cost/Month |
|---------|---------------|------------|
| EC2 (Backend) | t3.medium (2 vCPU, 4 GB) | $30 |
| RDS PostgreSQL | db.t3.small (2 vCPU, 2 GB) | $25 |
| S3 (Frontend) | 10 GB storage + CDN | $5 |
| CloudFront | 100 GB transfer | $10 |
| Load Balancer | ALB | $20 |
| **Total** | | **~$90/month** |

### 18.3 On-Premise Costs

| Item | One-Time Cost |
|------|---------------|
| Server (16 CPU, 64 GB RAM) | $5,000 |
| Storage (1 TB SSD) | $500 |
| Network Equipment | $1,000 |
| Backup System | $1,500 |
| **Total** | **~$8,000** |

**Ongoing:** Power, maintenance, staff (~$500/month)

---

## 19. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Data breach** | Low | Critical | Encryption, access control, audit logs |
| **NLP accuracy** | Medium | High | Continuous training, fallback responses |
| **Database corruption** | Low | High | Regular backups, replication |
| **Scalability issues** | Medium | Medium | Load testing, caching, horizontal scaling |
| **User adoption** | Medium | High | Training, documentation, support |
| **Kannada support delay** | High | Medium | Phase 2 feature, communicate timeline |

---

## 20. Success Metrics

### 20.1 Technical KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Uptime** | 99.5% | Server monitoring |
| **Response Time (p95)** | <2s | API metrics |
| **Error Rate** | <1% | Error logs |
| **NLP Accuracy** | >85% | Manual evaluation |

### 20.2 Business KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Daily Active Users** | 100+ | Analytics |
| **Queries per Day** | 500+ | Database logs |
| **User Satisfaction** | >4/5 | Surveys |
| **Query Success Rate** | >90% | Intent confidence |

### 20.3 Adoption Metrics

```
Month 1: 10 users (pilot)
Month 3: 50 users (district rollout)
Month 6: 200 users (state-wide)
Month 12: 500+ users (full adoption)
```

---

## 21. Conclusion

### 21.1 Current State Summary

✅ **Complete:**
- Core architecture designed
- Database schema implemented
- NLP pipeline functional
- API endpoint working
- Frontend UI developed

⚠️ **In Progress:**
- Model training (small dataset)
- UI polish
- Testing

❌ **Pending:**
- Production deployment
- Kannada support
- Advanced features


### 21.2 Next Steps (Recommended Order)

#### Immediate (Week 1)
1. ✅ Train NLP model with expanded training data
2. ✅ Generate realistic seed data (100+ crimes)
3. ✅ Fix frontend UI issues
4. ✅ End-to-end testing
5. ✅ Create deployment documentation

#### Short-term (Month 1)
1. Pilot deployment (10 users)
2. Collect user feedback
3. Improve NLP accuracy based on real queries
4. Add result formatting (cards/tables)
5. Implement audit logging

#### Medium-term (Month 3)
1. Migrate to PostgreSQL
2. Implement authentication
3. Add analytics dashboard
4. Start Kannada data collection
5. Performance optimization

#### Long-term (Month 6+)
1. Kannada language support
2. Mobile app development
3. Advanced NLP (TREND intent)
4. Map integration
5. Multi-district rollout

---

## 22. Appendix

### 22.1 Glossary

| Term | Definition |
|------|------------|
| **FIR** | First Information Report (police complaint) |
| **IPC** | Indian Penal Code (criminal law sections) |
| **KSP** | Karnataka State Police |
| **TF-IDF** | Term Frequency-Inverse Document Frequency |
| **ORM** | Object-Relational Mapping |
| **RBAC** | Role-Based Access Control |

### 22.2 References

- FastAPI Documentation: https://fastapi.tiangolo.com/
- SQLAlchemy Documentation: https://docs.sqlalchemy.org/
- scikit-learn Documentation: https://scikit-learn.org/
- React Documentation: https://react.dev/
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

### 22.3 Contact & Support

```
Project Lead: [To be assigned]
Technical Contact: [To be assigned]
Support Email: support@ksp-crime-ai.gov.in
Documentation: /docs
Issue Tracker: GitHub Issues
```

---

**Document Version:** 1.0  
**Last Updated:** June 22, 2024  
**Authors:** Development Team  
**Status:** Living Document

---

