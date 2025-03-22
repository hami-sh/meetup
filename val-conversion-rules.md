# Val Conversion Rules

This document provides guidelines for converting a standard website into a Val-compatible file for deployment on Valtown or other similar platforms.

## General Structure

```javascript
import { sqlite } from "https://esm.town/v/std/sqlite";

// Database initialization
async function initializeDatabase() {
  // Database schema setup
}

// Data retrieval functions
async function getAllData() {
  // Fetch data from database
}

// Main handler (required export)
export default async function(req) {
  // Initialize database
  await initializeDatabase();
  
  // Route handling based on URL path
  const url = new URL(req.url);
  
  switch (url.pathname) {
    case "/":
      return handleMainPage();
    case "/api/submit":
      return handleFormSubmission(req);
    case "/api/updates":
      return handleSSEUpdates();
    case "/assets/styles.css":
      return handleStyles();
    default:
      return new Response("Not Found", { status: 404 });
  }
}

// Route handlers and asset functions
// ...

// HTML/CSS constants
// ...
```

## Conversion Steps

1. **Identify Resources**: Determine which files need to be embedded (HTML, CSS, JS, images)
2. **Create Database Schema**: Design SQLite tables for any state that needs to be persisted
3. **Set Up Route Handlers**: Create handlers for each distinct URL path
4. **Embed Static Content**: Include all HTML, CSS as constants
5. **Implement Form Handling**: Add logic for form submissions
6. **Add Real-time Updates**: Implement SSE if real-time updates are needed

## Database Integration

```javascript
// Initialize database
async function initializeDatabase() {
  try {
    await sqlite.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS table_name (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          field1 TEXT NOT NULL,
          field2 TEXT NOT NULL
        )
      `,
      args: {},
    });
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Insert data
async function insertData(data) {
  await sqlite.execute({
    sql: `INSERT INTO table_name (field1, field2) VALUES (:value1, :value2)`,
    args: { value1: data.field1, value2: data.field2 },
  });
}

// Retrieve data
async function getData() {
  const result = await sqlite.execute({
    sql: "SELECT id, field1, field2 FROM table_name ORDER BY timestamp DESC",
    args: {},
  });

  return result.rows.map(row => ({
    id: row[0],
    field1: row[1],
    field2: row[2],
  }));
}
```

## Form Handling

```javascript
async function handleFormSubmission(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    
    // Validate inputs
    if (!body.field1 || !body.field2) {
      return new Response("Required fields missing", { status: 400 });
    }

    // Insert data into database
    await insertData(body);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing submission:", error);
    return new Response("Server Error", { status: 500 });
  }
}
```

## Server-Sent Events (SSE)

```javascript
function handleSSEUpdates() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      const data = await getData();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ data })}\n\n`));

      // Check for updates periodically
      const intervalId = setInterval(async () => {
        try {
          const updatedData = await getData();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ data: updatedData })}\n\n`));
        } catch (error) {
          console.error("Error sending SSE update:", error);
          clearInterval(intervalId);
          controller.close();
        }
      }, 3000);

      // Cleanup
      return () => clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

## Client-Side JavaScript

When embedding client-side JavaScript, make sure to:

1. Include event listeners inside a `DOMContentLoaded` event
2. Use relative paths for API endpoints
3. Implement error handling for fetch requests
4. Set up event source reconnection logic for SSE

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-id');
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Form submission logic
    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          field1: document.getElementById('field1').value,
          field2: document.getElementById('field2').value
        }),
      });
      
      if (response.ok) {
        // Handle success
      } else {
        // Handle error
      }
    } catch (error) {
      console.error('Error:', error);
    }
  });

  // Setup SSE connection
  function setupEventSource() {
    const eventSource = new EventSource('/api/updates');
    
    eventSource.onopen = () => {
      // Connection opened
    };
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update UI with data
    };
    
    eventSource.onerror = () => {
      eventSource.close();
      setTimeout(setupEventSource, 3000); // Reconnect after delay
    };
  }
  
  setupEventSource();
});
```

## Resource Embedding

For static resources like CSS, embed them as string constants:

```javascript
function handleStyles() {
  return new Response(CSS_CONTENT, {
    headers: { "Content-Type": "text/css" },
  });
}

const CSS_CONTENT = `
  /* CSS content goes here */
  body {
    font-family: sans-serif;
    margin: 0;
    padding: 20px;
  }
  /* ... */
`;
```

## Optimizations and Best Practices

1. **Minimize External Dependencies**: Include only essential imports
2. **Cache Heavy Queries**: If data doesn't change frequently, cache results
3. **Use Efficient Queries**: Optimize SQLite queries for performance
4. **Handle Errors Gracefully**: Implement comprehensive error handling
5. **Minimize HTML Size**: Remove unnecessary whitespace and comments
6. **Use Connection Pooling**: For databases with heavy write operations
7. **Implement Rate Limiting**: For public-facing forms

## Testing

Before deploying your Val:

1. Test all form submissions
2. Verify real-time updates work correctly
3. Test error handling for invalid inputs
4. Check CSS and styling on different viewports
5. Ensure database schema creates successfully

## Example Conversion

See the `meetup.js` file for a complete example of converting a static site to a Val with:

- SQLite database for storing registrations
- Form handling for user submissions
- Real-time updates via SSE
- CSS embedding
- Responsive design 