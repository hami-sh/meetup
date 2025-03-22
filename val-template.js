import { sqlite } from "https://esm.town/v/std/sqlite";

// Initialize the database schema if not exists
async function initializeDatabase() {
  try {
    await sqlite.execute({
      sql: `
        CREATE TABLE IF NOT EXISTS data_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL DEFAULT (datetime('now')),
          name TEXT NOT NULL,
          email TEXT NOT NULL
          /* Add additional fields as needed */
        )
      `,
      args: {},
    });
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Get all items from the database
async function getAllItems() {
  try {
    const result = await sqlite.execute({
      sql: "SELECT id, name, email FROM data_items ORDER BY timestamp DESC",
      args: {},
    });

    return result.rows.map(row => ({
      id: row[0],
      name: row[1],
      email: row[2],
      // Map additional fields as needed
    }));
  } catch (error) {
    console.error("Error fetching data:", error);
    return [];
  }
}

// Main request handler
export default async function(req) {
  // Initialize database on every request
  await initializeDatabase();

  const url = new URL(req.url);

  // Handle different routes based on the path
  switch (url.pathname) {
    case "/":
      return handleMainPage();
    case "/api/submit":
      return handleFormSubmission(req);
    case "/api/updates":
      return handleSSEUpdates();
    case "/styles.css":
      return handleStyles();
    default:
      return new Response("Not Found", { status: 404 });
  }
}

// Handle the main page request
async function handleMainPage() {
  return new Response(HTML_CONTENT, {
    headers: { "Content-Type": "text/html" },
  });
}

// Handle form submission
async function handleFormSubmission(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { name, email } = body;

    // Validate inputs
    if (!name || !email) {
      return new Response("Required fields missing", { status: 400 });
    }

    // Insert the new item into the database
    await sqlite.execute({
      sql: `INSERT INTO data_items (name, email) VALUES (:name, :email)`,
      args: { name, email },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing submission:", error);
    return new Response("Server Error", { status: 500 });
  }
}

// Handle SSE connections for real-time updates
function handleSSEUpdates() {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial data
      const items = await getAllItems();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ items })}\n\n`));

      // Check for updates every 3 seconds
      const intervalId = setInterval(async () => {
        try {
          const updatedItems = await getAllItems();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ items: updatedItems })}\n\n`));
        } catch (error) {
          console.error("Error sending SSE update:", error);
          clearInterval(intervalId);
          controller.close();
        }
      }, 3000);

      // Cleanup when the connection is closed
      return () => {
        clearInterval(intervalId);
      };
    },
  });

  // Return the SSE response
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Handle CSS file request
function handleStyles() {
  return new Response(CSS_CONTENT, {
    headers: { "Content-Type": "text/css" },
  });
}

// CSS content
const CSS_CONTENT = `
/* Your CSS goes here */
body {
  font-family: sans-serif;
  margin: 0;
  padding: 20px;
}

/* Add more CSS as needed */
`;

// HTML content for the main page
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Val App</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <header>
      <h1>My Val App</h1>
    </header>
    
    <main>
      <section>
        <h2>Submit Data</h2>
        <form id="data-form">
          <div class="form-group">
            <label for="name">Name:</label>
            <input type="text" id="name" name="name" required>
          </div>
          
          <div class="form-group">
            <label for="email">Email:</label>
            <input type="email" id="email" name="email" required>
          </div>
          
          <button type="submit">Submit</button>
        </form>
      </section>
      
      <section>
        <h2>Real-time Data</h2>
        <div class="status">Status: <span id="connection-status">Connecting...</span></div>
        <div id="items-list"></div>
      </section>
    </main>
    
    <footer>
      <p>&copy; 2024 My Val App</p>
    </footer>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('data-form');
        const connectionStatus = document.getElementById('connection-status');
        const itemsList = document.getElementById('items-list');
        
        // Handle form submission
        form.addEventListener('submit', async function(e) {
          e.preventDefault();
          
          const nameInput = document.getElementById('name');
          const emailInput = document.getElementById('email');
          
          const name = nameInput.value.trim();
          const email = emailInput.value.trim();
          
          if (!name || !email) {
            alert('Please fill out all required fields');
            return;
          }
          
          try {
            const response = await fetch('/api/submit', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ name, email }),
            });
            
            if (response.ok) {
              // Clear the form on success
              nameInput.value = '';
              emailInput.value = '';
              alert('Submission successful!');
            } else {
              const data = await response.text();
              alert('Error: ' + data);
            }
          } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during submission');
          }
        });
        
        // Set up SSE connection
        function initEventSource() {
          connectionStatus.textContent = 'Connecting...';
          
          const eventSource = new EventSource('/api/updates');
          
          eventSource.onopen = () => {
            connectionStatus.textContent = 'Connected';
          };
          
          eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.items) {
                updateItemsList(data.items);
              }
            } catch (e) {
              console.error('Error parsing event data:', e);
            }
          };
          
          eventSource.onerror = () => {
            connectionStatus.textContent = 'Connection error. Reconnecting...';
            eventSource.close();
            setTimeout(initEventSource, 3000);
          };
          
          return eventSource;
        }
        
        // Update the items list
        function updateItemsList(items) {
          if (items.length === 0) {
            itemsList.textContent = 'No items available.';
            return;
          }
          
          let html = '<ul>';
          for (const item of items) {
            html += '<li>' + item.name + ' (' + item.email + ')</li>';
          }
          html += '</ul>';
          
          itemsList.innerHTML = html;
        }
        
        // Start SSE connection
        initEventSource();
      });
    </script>
  </body>
</html>`; 