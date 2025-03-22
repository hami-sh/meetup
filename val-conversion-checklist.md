# Val Conversion Checklist

A practical, step-by-step checklist for converting any website to a Val for Valtown.

## Initial Assessment

- [ ] List all static files that need to be embedded (.html, .css, .js)
- [ ] Identify interactions that require database state
- [ ] Map out all routes needed (main page, API endpoints, asset files)
- [ ] Determine if real-time updates are needed

## File Setup

- [ ] Create a single `.js` file (e.g., `mysite.js`)
- [ ] Add SQLite import: `import { sqlite } from "https://esm.town/v/std/sqlite";`
- [ ] Create the `export default async function(req)` handler
- [ ] Set up route handling with `switch (url.pathname)`

## Database

- [ ] Design database schema (tables, fields, relationships)
- [ ] Create `initializeDatabase()` function with `CREATE TABLE IF NOT EXISTS` statements
- [ ] Add data retrieval functions for each entity
- [ ] Implement insert/update/delete functions as needed

## Static Content

- [ ] Create constants for HTML content: `const HTML_CONTENT = `...`;`
- [ ] Create constants for CSS content: `const CSS_CONTENT = `...`;`
- [ ] Add handlers to serve static content:
  ```javascript
  function handleMainPage() {
    return new Response(HTML_CONTENT, {
      headers: { "Content-Type": "text/html" },
    });
  }
  ```

## User Interactions

- [ ] Add form handlers for each user input:
  ```javascript
  async function handleFormSubmission(req) {
    // Parse form data, validate, save to database
  }
  ```
- [ ] Validate all user inputs
- [ ] Add appropriate error responses
- [ ] Implement success responses

## Real-time Updates (if needed)

- [ ] Implement Server-Sent Events handler:
  ```javascript
  function handleSSEUpdates() {
    // Create ReadableStream for SSE
  }
  ```
- [ ] Add client-side EventSource setup in HTML/JS
- [ ] Implement polling mechanism to check for updates
- [ ] Add UI update logic for received events

## Client-Side JavaScript

- [ ] Wrap code in `DOMContentLoaded` event listener
- [ ] Add form submission handlers with fetch API
- [ ] Implement error handling for API calls
- [ ] Add any event listeners for UI interactions

## Testing

- [ ] Test all database operations
- [ ] Verify all routes return expected responses
- [ ] Test form submissions with valid and invalid data
- [ ] Verify real-time updates work correctly
- [ ] Test on different screen sizes

## Deployment

- [ ] Ensure file size is within Valtown limits
- [ ] Make sure all embedded content is properly formatted
- [ ] Remove any debug/console statements
- [ ] Deploy to Valtown

## Common Issues to Check

- [ ] Resource paths are relative (e.g., `/api/submit` not `https://example.com/api/submit`)
- [ ] All form submissions use `await req.json()` or `await req.formData()`
- [ ] SSE connections handle reconnection on failures
- [ ] Proper error handling is in place for database operations
- [ ] CSP and CORS headers are set appropriately

## Optimization

- [ ] Minimize HTML/CSS/JS size
- [ ] Remove unnecessary whitespace and comments
- [ ] Cache database results where appropriate
- [ ] Use efficient SQL queries 