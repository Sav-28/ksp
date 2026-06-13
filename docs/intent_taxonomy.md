# KSP Crime AI Intent and Entity Taxonomy

## Core Intents

1. **SHOW_CRIMES**
   - Description: Display detailed crime records matching criteria
   - Example queries: "Show crimes in Bengaluru last month", "List all thefts near MG Road"

2. **COUNT_CRIMES**
   - Description: Return the count of crimes matching criteria
   - Example queries: "How many thefts near MG Road yesterday?", "Count of murder cases in 2023"

3. **TREND**
   - Description: Show trends or patterns over time
   - Example queries: "What's the trend of snatching in Koramangala?", "Is crime increasing in Mysore?"

4. **HELP**
   - Description: Provide assistance about the system
   - Example queries: "Help me understand this system", "What can you do?"

## Entities

### Location
- Description: Geographic area (district, taluk, or police station)
- Examples: "Bengaluru", "MG Road", "Yelahanka police station"

### Date Range
- Description: Time period for the query
- Format: ISO dates (YYYY-MM-DD) or relative terms like "last month", "yesterday", "2023"
- Examples: "last month", "yesterday", "2023-05-01 to 2023-05-31"

### Crime Type
- Description: Type of crime, mapped to IPC sections
- Examples: "theft" (IPC 379), "murder" (IPC 302), "snatching" (IPC 356)

## Confidence Thresholds
- High confidence: > 0.7
- Medium confidence: 0.3 - 0.7
- Low confidence: < 0.3 (treated as UNKNOWN)

## Language Support
- Primary: English (MVP)
- Secondary: Kannada (planned for future phases)