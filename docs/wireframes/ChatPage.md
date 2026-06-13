# ChatPage Wireframe

## Layout
```
+--------------------------------------------------+
|                      Header                      |
|   KSP Crime AI - Conversational Interface        |
+--------------------------------------------------+
|                                                  |
|            Chat Messages Area (Scrollable)       |
|                                                  |
|  [User] Show crimes in Bengaluru last month      |
|  [Bot] Here are the first 3 crimes:              |
|  • FIR001: Mobile phone theft near mall          |
|  • FIR002: Purse snatching at bus stop           |
|  • FIR003: Bike theft from apartment complex     |
|                                                  |
|                                                  |
+--------------------------------------------------+
| [ Input Field ] [ Send Button ] [ Voice Button ] |
+--------------------------------------------------+
```

## Components

1. **Header**: Fixed at top, shows app title
2. **Chat Messages Area**: 
   - Takes remaining vertical space
   - Scrollable when messages exceed view
   - Messages displayed in bubbles:
     - User messages: Right-aligned, light blue background
     - Bot messages: Left-aligned, dark blue background with white text
3. **Input Area**: Fixed at bottom
   - Text input field for typing queries
   - Send button (paper plane icon)
   - Voice button (microphone icon)

## Styling
- **Primary Color**: Dark blue (#003366) - Police theme
- **Secondary Colors**: White, light gray (#f5f7fa), light blue (#e9f5ff)
- **Font**: Clean, readable sans-serif
- **Spacing**: Comfortable padding and margins for touch targets
- **Accessibility**: Large touch targets (≥48px), good color contrast

## Behavior
- Messages auto-scroll to bottom when new messages arrive
- Input field clears after sending
- Voice button activates speech recognition with language hint 'kn-IN'
- Loading state shows "Thinking..." message during API calls
- Error messages appear in bot message bubbles
- Placeholder text guides user: "Ask about crimes in English or Kannada..."