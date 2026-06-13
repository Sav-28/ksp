# KSP Crime AI

A conversational interface for querying crime databases, designed for Karnataka State Police (KSP) officers. This MVP allows officers to ask questions about crime data using natural language in English or Kannada.

## Architecture

This project follows a monolithic MVP architecture with clear separation of concerns:

```
ksp-crime-ai/
├── backend/                    # Python/FastAPI monolith
│   ├── src/
│   │   ├── api/               # HTTP layer (FastAPI)
│   │   │   └── routes/        # POST /chat endpoint
│   │   ├── database/          # Data layer (SQLAlchemy + Alembic)
│   │   │   ├── models/        # SQLAlchemy models
│   │   │   ├── seeds/         # Initial data scripts
│   │   │   └── migrations/    # Alembic migrations
│   │   ├── nlp/               # NLP pipeline
│   │   │   ├── intent_classifier.py   # TF-IDF + LogisticRegression
│   │   │   └── ...            # Future: entity extractor, language detector
│   │   ├── query_engine/      # SQL translation & validation
│   │   │   ├── translator.py    # Intent → parameterized SQL
│   │   │   └── validators.py    # Input sanitization rules
│   │   └── utils/             # Logging, audit helpers
│   ├── tests/                 # Unit/integration tests
│   ├── requirements.txt       # Python dependencies
│   └── main.py                # App entrypoint
├── frontend/                  # React SPA (low-literacy tablet UI)
│   ├── src/
│   │   ├── components/        # MessageBubble, InputField, VoiceButton
│   │   ├── pages/             # ChatPage.tsx
│   │   ├── hooks/             # Custom API hooks
│   │   └── utils/             # Speech recognition helpers
│   ├── public/
│   └── package.json           # Frontend dependencies
├── docs/                      # Architectural decisions (human-maintained)
│   ├── schema.sql             # Canonical DB schema
│   ├── intent_taxonomy.md     # Core intents/entities
│   ├── api_contract.md        # /chat spec
│   └── wireframes/            # ChatPage layout
├── data/                      # Seed data
│   └── initial_seeds.csv
└── .claude/                   # Claude Code settings
```

## Features (MVP)

- Natural language query interface
- English language support (Kannada planned for future)
- Voice input via Web Speech API
- Database-backed crime records
- Secure parameterized queries to prevent SQL injection
- Audit logging for accountability
- Responsive design for tablet use

## Getting Started

### Prerequisites

- Python 3.8+
- Node.js 16+
- PostgreSQL 12+

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd ksp-crime-ai/backend
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Set up the database:
   ```bash
   # Create database
   createdb ksp_crime_ai
   
   # Run migrations (if using Alembic)
   # alembic upgrade head
   
   # For now, we'll use the mock database implementation
   ```

4. Start the backend server:
   ```bash
   python main.py
   ```
   The API will be available at `http://localhost:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd ksp-crime-ai/frontend
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Start the frontend development server:
   ```bash
   npm start
   ```
   The application will be available at `http://localhost:3000`

### Using the Application

1. Open your browser to `http://localhost:3000`
2. Type or speak your query in the input field
3. Examples to try:
   - "Show crimes in Bengaluru last month"
   - "How many thefts near MG Road yesterday?"
   - "List all murder cases in 2023"
4. Use the voice button (microphone icon) for speech input

## Project Structure

### Backend Modules

- **models.py**: SQLAlchemy models for crimes, districts, crime_types, police_stations
- **intent_classifier.py**: TF-IDF + LogisticRegression intent classifier
- **translator.py**: Converts intents/entities to parameterized SQL
- **chat.py**: FastAPI endpoint for /chat
- **main.py**: Application entrypoint

### Frontend Components

- **ChatPage.tsx**: Main chat interface
- **MessageBubble**: Displays chat messages
- **InputField**: Text input and send button
- **VoiceButton**: Speech recognition button

## Design Principles

1. **Scope Narrowly**: Focused MVP without over-engineering
2. **Anchor to Concrete Data**: Uses real schema and example queries
3. **Specify Constraints Explicitly**: Addresses voice, language, data quality upfront
4. **Iterate with Feedback**: Each phase builds on the previous
5. **Keep Humans in the Loop**: Audit logging and manual review for security

## Phased Development

This project follows the phased approach outlined in the documentation:

- **Phase 0**: Foundation (schema, intents, API contract, wireframes)
- **Phase 1**: Data Mapping & Models (SQLAlchemy models)
- **Phase 2**: Basic NLP Pipeline (English intent classifier)
- **Phase 3**: Query Engine (Intent → safe SQL translator)
- **Phase 4**: API & Frontend (POST /chat endpoint + React chat interface)

## Security Considerations

- All database queries use parameterized statements to prevent SQL injection
- Input validation rejects malformed requests
- Audit logging tracks all queries for accountability
- No external API dependencies (works offline)
- Limited result sets (100 records max) to prevent resource exhaustion

## Future Enhancements

- Kannada language support
- Entity extraction (locations, dates, crime types)
- Advanced NLP (spaCy, transformer models)
- User authentication and role-based access
- Data export capabilities
- Analytics dashboard
- Mobile app version

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built for Karnataka State Police (KSP)
- Inspired by community policing initiatives
- Created with Claude Code