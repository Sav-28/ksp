# KSP Crime AI API Contract

## Endpoint: POST /chat

### Description
Main conversational interface for querying the crime database.

### Request
```json
{
  "text": "string (required)",
  "language": "string (optional, defaults to 'en')",
  "sessionId": "string (optional)"
}
```

#### Fields:
- **text**: User's query in English or Kannada
- **language**: Language code ('en' for English, 'kn' for Kannada)
- **sessionId**: Optional identifier for chat history tracking

### Response
```json
{
  "answer": "string",
  "sql": "string",
  "results": "array of objects",
  "error": "string or null"
}
```

#### Fields:
- **answer**: Natural language response to the user
- **sql**: Generated SQL query (for debugging, remove in production)
- **results**: Array of crime records matching the query
- **error**: Error message if applicable, null if successful

### Response Examples

#### Successful COUNT_CRIMES
```json
{
  "answer": "Found 5 crimes matching your criteria.",
  "sql": "SELECT COUNT(*) FROM crimes WHERE district ILIKE :loc AND date_occurred BETWEEN :start AND :end LIMIT :limit",
  "results": [],
  "error": null
}
```

#### Successful SHOW_CRIMES
```json
{
  "answer": "Here are the first 3 crimes:",
  "sql": "SELECT * FROM crimes WHERE crime_type ILIKE :ctype LIMIT :limit",
  "results": [
    {
      "id": 1,
      "fir_number": "FIR001",
      "date_occurred": "2023-05-15",
      "district": "Bengaluru Urban",
      "taluk": "Bengaluru North",
      "police_station": "Yelahanka",
      "crime_type": "theft",
      "description": "Mobile phone theft near mall",
      "latitude": 13.1081,
      "longitude": 77.5874
    }
  ],
  "error": null
}
```

#### Error Response
```json
{
  "answer": "Sorry, I couldn't process that. Try: 'Show crimes in [place] last month'",
  "sql": null,
  "results": [],
  "error": "Either location or date_range must be provided for SHOW_CRIMES or COUNT_CRIMES intents"
}
```

### Status Codes
- **200**: Successful request
- **400**: Validation error (invalid input)
- **500**: Internal server error

### Notes
1. The `sql` field is included for debugging purposes during development and should be removed in production
2. For COUNT_CRIMES queries, the `results` array will be empty as only the count is returned in the answer
3. Maximum results for SHOW_CRIMES is limited to 100 records for performance
4. All text matching uses case-insensitive ILIKE queries for better user experience