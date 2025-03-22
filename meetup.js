import { sqlite } from "https://esm.town/v/std/sqlite";

// Initialize the database schema if not exists
async function initializeDatabase() {
  try {
    // Check if the table exists first
    const tableExists = await sqlite.execute({
      sql: `SELECT name FROM sqlite_master WHERE type='table' AND name='registrations'`,
      args: {},
    });

    if (tableExists.rows.length === 0) {
      // Create the table for registrations with all columns
      await sqlite.execute({
        sql: `
          CREATE TABLE IF NOT EXISTS registrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            is_speaker BOOLEAN DEFAULT 0,
            topic TEXT,
            profile_pic TEXT
          )
        `,
        args: {},
      });
    } else {
      // Check if the topic column exists
      const columnCheck = await sqlite.execute({
        sql: `PRAGMA table_info(registrations)`,
        args: {},
      });
      
      const columns = columnCheck.rows.map(row => row[1]); // Column name is at index 1
      
      // Add topic column if it doesn't exist
      if (!columns.includes('topic')) {
        await sqlite.execute({
          sql: `ALTER TABLE registrations ADD COLUMN topic TEXT`,
          args: {},
        });
        console.log("Added topic column to registrations table");
      }
      
      // Add is_speaker column if it doesn't exist
      if (!columns.includes('is_speaker')) {
        await sqlite.execute({
          sql: `ALTER TABLE registrations ADD COLUMN is_speaker BOOLEAN DEFAULT 0`,
          args: {},
        });
        console.log("Added is_speaker column to registrations table");
      }
      
      // Add profile_pic column if it doesn't exist
      if (!columns.includes('profile_pic')) {
        await sqlite.execute({
          sql: `ALTER TABLE registrations ADD COLUMN profile_pic TEXT`,
          args: {},
        });
        console.log("Added profile_pic column to registrations table");
      }
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Get all registrations from the database
async function getAllRegistrations() {
  try {
    // First check if the necessary columns exist
    const columnCheck = await sqlite.execute({
      sql: `PRAGMA table_info(registrations)`,
      args: {},
    });
    
    const columns = columnCheck.rows.map(row => row[1]);
    
    // Build the SELECT statement based on available columns
    const selectColumns = ['id', 'name', 'email'];
    if (columns.includes('is_speaker')) selectColumns.push('is_speaker');
    if (columns.includes('topic')) selectColumns.push('topic');
    if (columns.includes('profile_pic')) selectColumns.push('profile_pic');
    
    const columnString = selectColumns.join(', ');
    
    const result = await sqlite.execute({
      sql: `SELECT ${columnString} FROM registrations ORDER BY timestamp DESC`,
      args: {},
    });

    return result.rows.map(row => {
      let idx = 0;
      const registration = {
        id: row[idx++],
        name: row[idx++],
        email: row[idx++]
      };
      
      if (columns.includes('is_speaker')) registration.is_speaker = row[idx++] === 1;
      if (columns.includes('topic')) registration.topic = row[idx++];
      if (columns.includes('profile_pic')) registration.profile_pic = row[idx++];
      
      return registration;
    });
  } catch (error) {
    console.error("Error fetching registrations:", error);
    return [];
  }
}

// Get only speaker registrations
async function getSpeakers() {
  try {
    // First check if the necessary columns exist using the prepared schema
    const columnCheck = await sqlite.execute({
      sql: `PRAGMA table_info(registrations)`,
      args: {},
    });
    
    const columns = columnCheck.rows.map(row => row[1]);
    
    // If topic or is_speaker columns don't exist, return empty array
    if (!columns.includes('topic') || !columns.includes('is_speaker')) {
      console.log("Required columns missing for speaker query, returning empty array");
      return [];
    }
    
    // Check which columns we can select
    const selectColumns = ['id', 'name'];
    if (columns.includes('topic')) selectColumns.push('topic');
    if (columns.includes('profile_pic')) selectColumns.push('profile_pic');
    
    const columnString = selectColumns.join(', ');
    
    const result = await sqlite.execute({
      sql: `SELECT ${columnString} FROM registrations WHERE is_speaker = 1 ORDER BY timestamp DESC`,
      args: {},
    });

    return result.rows.map(row => {
      let idx = 0;
      const speaker = {
        id: row[idx++],
        name: row[idx++]
      };
      
      if (columns.includes('topic')) speaker.topic = row[idx++];
      if (columns.includes('profile_pic')) speaker.profile_pic = row[idx++];
      
      return speaker;
    });
  } catch (error) {
    console.error("Error fetching speakers:", error);
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
    case "/submit-registration":
      return handleRegistrationSubmission(req);
    case "/registration-updates":
      return handleSSEUpdates();
    case "/reset.css":
      return handleResetCSS();
    case "/index.css":
      return handleMainCSS();
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

// Handle registration form submission
async function handleRegistrationSubmission(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const { name, email, is_speaker, topic, profile_pic } = body;

    // Validate inputs
    if (!name || !email) {
      return new Response("Name and email are required", { status: 400 });
    }

    // Validate speaker info if registering as a speaker
    if (is_speaker && !topic) {
      return new Response("Topic is required for speakers", { status: 400 });
    }

    // Insert the new registration into the database
    await sqlite.execute({
      sql: `INSERT INTO registrations (name, email, is_speaker, topic, profile_pic) 
            VALUES (:name, :email, :is_speaker, :topic, :profile_pic)`,
      args: { 
        name, 
        email, 
        is_speaker: is_speaker ? 1 : 0, 
        topic: topic || null, 
        profile_pic: profile_pic || null 
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing registration submission:", error);
    return new Response("Server Error", { status: 500 });
  }
}

// Handle SSE connections for real-time updates
function handleSSEUpdates() {
  const encoder = new TextEncoder();
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      
      // Send initial data
      try {
        const registrations = await getAllRegistrations();
        if (!isClosed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ registrations })}\n\n`));
        }
      } catch (error) {
        console.error("Error sending initial SSE data:", error);
        if (!isClosed) {
          try {
            controller.close();
            isClosed = true;
          } catch (closeError) {
            console.error("Error closing controller:", closeError);
          }
        }
        return;
      }

      // Check for updates every 3 seconds
      const intervalId = setInterval(async () => {
        if (isClosed) {
          clearInterval(intervalId);
          return;
        }
        
        try {
          const updatedRegistrations = await getAllRegistrations();
          
          // Check if the controller can still enqueue data
          if (!isClosed) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                registrations: updatedRegistrations
              })}\n\n`));
            } catch (enqueueError) {
              console.log("Client disconnected, closing SSE stream");
              isClosed = true;
              clearInterval(intervalId);
            }
          }
        } catch (error) {
          console.error("Error fetching data for SSE update:", error);
          if (!isClosed) {
            try {
              controller.close();
              isClosed = true;
            } catch (closeError) {
              // Already closed or invalid controller, just clean up
            }
            clearInterval(intervalId);
          }
        }
      }, 3000);

      // Cleanup when the connection is closed
      return () => {
        isClosed = true;
        clearInterval(intervalId);
      };
    },

    cancel() {
      // This is called when the client disconnects
      console.log("SSE stream cancelled by client");
    }
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

// Handle reset.css file request
function handleResetCSS() {
  return new Response(RESET_CSS, {
    headers: { "Content-Type": "text/css" },
  });
}

// Handle index.css file request
function handleMainCSS() {
  return new Response(MAIN_CSS, {
    headers: { "Content-Type": "text/css" },
  });
}

// CSS content for reset.css
const RESET_CSS = `/* http://meyerweb.com/eric/tools/css/reset/ 
   v2.0 | 20110126
   License: none (public domain)
*/

html, body, div, span, applet, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code,
del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var,
b, u, i, center,
dl, dt, dd, ol, ul, li,
fieldset, form, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, 
figure, figcaption, footer, header, hgroup, 
menu, nav, output, ruby, section, summary,
time, mark, audio, video {
	padding: 0;
	border: 0;
	font-size: 100%;
	font: inherit;
	vertical-align: baseline;
}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, 
footer, header, hgroup, menu, nav, section {
	display: block;
}
body {
	line-height: 1;
}
ol, ul {
	list-style: none;
}
blockquote, q {
	quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
	content: '';
	content: none;
}
table {
	border-collapse: collapse;
	border-spacing: 0;
}`;

// CSS content for index.css
const MAIN_CSS = `@import url('https://fonts.cdnfonts.com/css/jetbrains-mono-2');

:root {
  --font-family: "JetBrains Mono", monospace;
  --line-height: 1.20rem;
  --border-thickness: 2px;
  --text-color: #000;
  --text-color-alt: #666;
  --background-color: #fff;
  --background-color-alt: #eee;

  --font-weight-normal: 500;
  --font-weight-medium: 600;
  --font-weight-bold: 800;

  font-family: var(--font-family);
  font-optical-sizing: auto;
  font-weight: var(--font-weight-normal);
  font-style: normal;
  font-variant-numeric: tabular-nums lining-nums;
  font-size: 16px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --text-color: #fff;
    --text-color-alt: #aaa;
    --background-color: #000;
    --background-color-alt: #111;
  }
}

* {
  box-sizing: border-box;
}


* + * {
  margin-top: var(--line-height);
}

html {
  display: flex;
  width: 100%;
  margin: 0;
  padding: 0;
  flex-direction: column;
  align-items: center;
  background: var(--background-color);
  color: var(--text-color);
}

body {
  position: relative;
  width: 100%;
  margin: 0;
  padding: var(--line-height) 2ch;
  max-width: calc(min(80ch, round(down, 100%, 1ch)));
  line-height: var(--line-height);
  overflow-x: hidden;
}

@media screen and (max-width: 480px) {
  :root {
    font-size: 14px;
  }
  body {
    padding: var(--line-height) 1ch;
  }
}

h1, h2, h3, h4, h5, h6 {
  font-weight: var(--font-weight-bold);
  margin: calc(var(--line-height) * 2) 0 var(--line-height);
  line-height: var(--line-height);
}

h1 {
  font-size: 2rem;
  line-height: calc(2 * var(--line-height));
  margin-bottom: calc(var(--line-height) * 2);
  text-transform: uppercase;
}
h2 {
  font-size: 1rem;
  text-transform: uppercase;
}

hr {
  position: relative;
  display: block;
  height: var(--line-height);
  margin: calc(var(--line-height) * 1.5) 0;
  border: none;
  color: var(--text-color);
}
hr:after {
  display: block;
  content: "";
  position: absolute;
  top: calc(var(--line-height) / 2 - var(--border-thickness));
  left: 0;
  width: 100%;
  border-top: calc(var(--border-thickness) * 3) double var(--text-color);
  height: 0;
}

a {
  text-decoration-thickness: var(--border-thickness);
}

a:link, a:visited {
  color: var(--text-color);
}

p {
  margin-bottom: var(--line-height);
}

strong {
  font-weight: var(--font-weight-bold);
}
em {
  font-style: italic;
}

sub {
  position: relative;
  display: inline-block;
  margin: 0;
  vertical-align: sub;
  line-height: 0;
  width: calc(1ch / 0.75);
  font-size: .75rem;
}

table {
  position: relative;
  top: calc(var(--line-height) / 2);
  width: calc(round(down, 100%, 1ch));
  border-collapse: collapse;
  margin: 0 0 calc(var(--line-height) * 2);
}

th, td {
  border: var(--border-thickness) solid var(--text-color);
  padding: 
    calc((var(--line-height) / 2))
    calc(1ch - var(--border-thickness) / 2)
    calc((var(--line-height) / 2) - (var(--border-thickness)))
  ;
  line-height: var(--line-height);
  vertical-align: top;
  text-align: left;
}
table tbody tr:first-child > * {
  padding-top: calc((var(--line-height) / 2) - var(--border-thickness));
}


th {
  font-weight: 700;
}
.width-min {
  width: 0%;
}
.width-auto {
  width: 100%;
}

.header {
  margin-bottom: calc(var(--line-height) * 2);
}
.header h1 {
  margin: 0;
}
.header tr td:last-child {
  text-align: right;
}

p {
  word-break: break-word;
  word-wrap: break-word;
  hyphens: auto;
}

img, video {
  display: block;
  width: 100%;
  object-fit: contain;
  overflow: hidden;
}
img {
  font-style: italic;
  color: var(--text-color-alt);
}

details {
  border: var(--border-thickness) solid var(--text-color);
  padding: calc(var(--line-height) - var(--border-thickness)) 1ch;
  margin-bottom: var(--line-height);
}

summary {
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}
details[open] summary {
  margin-bottom: var(--line-height);
}

details ::marker {
  display: inline-block;
  content: '▶';
  margin: 0;
}
details[open] ::marker {
  content: '▼';
}

details :last-child {
  margin-bottom: 0;
}

pre {
  white-space: pre;
  overflow-x: auto;
  margin: var(--line-height) 0;
  overflow-y: hidden;
}
figure pre {
  margin: 0;
}

pre, code {
  font-family: var(--font-family);
}

code {
  font-weight: var(--font-weight-medium);
}

figure {
  margin: calc(var(--line-height) * 2) 3ch;
  overflow-x: auto;
  overflow-y: hidden;
}

figcaption {
  display: block;
  font-style: italic;
  margin-top: var(--line-height);
}

ul, ol {
  padding: 0;
  margin: 0 0 var(--line-height);
}

ul {
  list-style-type: square;
  padding: 0 0 0 2ch;
}
ol {
  list-style-type: none;
  counter-reset: item;
  padding: 0;
}
ol ul,
ol ol,
ul ol,
ul ul {
  padding: 0 0 0 3ch;
  margin: 0;
}
ol li:before { 
  content: counters(item, ".") ". ";
  counter-increment: item;
  font-weight: var(--font-weight-medium);
}

li {
  margin: 0;
  padding: 0;
}

li::marker {
  line-height: 0;
}

::-webkit-scrollbar {
    height: var(--line-height);
}

input, button, textarea {
  border: var(--border-thickness) solid var(--text-color);
  padding: 
    calc(var(--line-height) / 2 - var(--border-thickness))
    calc(1ch - var(--border-thickness));
  margin: 0;
  font: inherit;
  font-weight: inherit;
  height: calc(var(--line-height) * 2);
  width: auto;
  overflow: visible;
  background: var(--background-color);
  color: var(--text-color);
  line-height: normal;
  -webkit-font-smoothing: inherit;
  -moz-osx-font-smoothing: inherit;
  -webkit-appearance: none;
}

input[type=checkbox] {
  display: inline-grid;
  place-content: center;
  vertical-align: top;
  width: 2ch;
  height: var(--line-height);
  cursor: pointer;
}
input[type=checkbox]:checked:before {
  content: "";
  width: 1ch;
  height: calc(var(--line-height) / 2);
  background: var(--text-color);
}

button:focus, input:focus {
  --border-thickness: 3px;
  outline: none;
}

input {
  width: calc(round(down, 100%, 1ch));
}
::placeholder {
  color: var(--text-color-alt);
  opacity: 1;
}
::-ms-input-placeholder {
  color: var(--text-color-alt);
}
button::-moz-focus-inner {
  padding: 0;
  border: 0
}

button {
  text-transform: uppercase;
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

button:hover {
  background: var(--background-color-alt);
}
button:active {
  transform: translate(2px, 2px);
}

label {
  display: block;
  width: calc(round(down, 100%, 1ch));
  height: auto;
  line-height: var(--line-height);
  font-weight: var(--font-weight-medium);
  margin: 0;
}

label input {
  width: 100%;
}

.registration-form {
  margin-top: 20px;
  padding: 15px;
  background-color: var(--background-color-alt);
  border-radius: 4px;
  border: var(--border-thickness) solid var(--text-color);
}

.form-group {
  margin-bottom: 15px;
}

.submit-btn {
  margin-top: 15px;
}

.connection-status {
  margin-top: 10px;
  font-size: 0.9em;
  color: var(--text-color-alt);
}

.participants {
  margin-top: 15px;
}

.participant-list {
  margin-top: 5px;
  font-size: 0.9em;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Speaker related styles */
.speaker-checkbox {
  display: flex;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.checkbox-label input {
  margin-right: 10px;
}

.speaker-fields {
  margin-top: 15px;
  padding: 15px;
  background-color: var(--background-color);
  border: var(--border-thickness) solid var(--text-color);
}

.speaker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 25px;
  margin-top: 25px;
}

.speaker-card {
  border: var(--border-thickness) solid var(--text-color);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  background-color: var(--background-color);
  /* Force exact same height for all cards */
  min-height: 400px;
}

.speaker-image {
  width: 100%;
  /* Fixed height for all image containers */
  height: 250px;
  overflow: hidden;
  margin-bottom: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: var(--border-thickness) solid var(--text-color);
  border-radius: 6px;
  background-color: var(--background-color-alt);
}

.speaker-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.placeholder-image {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--background-color-alt);
  color: var(--text-color-alt);
}

.speaker-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 5px;
}

.speaker-name {
  font-size: 1.2rem;
  margin-bottom: 10px;
  font-weight: var(--font-weight-bold);
  border-bottom: 2px solid var(--text-color);
  padding-bottom: 5px;
  width: 100%;
}

.speaker-topic {
  font-style: italic;
  color: var(--text-color-alt);
  line-height: 1.4;
}
`;

// HTML content for the main page (updated with registration form)
const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="description" content="Griftless - Engineering discussions without the hustle culture. A technical meetup focused on genuine knowledge sharing.">
        <meta name="keywords" content="engineering, technical meetup, software development, programming">
        <meta name="author" content="Hamish Bultitude">
        <title>Griftless - Engineering Meetup</title>
        <link rel="stylesheet" href="reset.css">
        <link rel="stylesheet" href="index.css">
        <link rel="icon" href="favicon.ico" type="image/x-icon">
        <style>
            .screensaver-container {
                position: relative;
                width: 100%;
                height: 200px;
                border: var(--border-thickness) solid var(--text-color);
                overflow: hidden;
                background-color: var(--background-color-alt);
                margin-top: 15px;
            }
            
            .participant-name {
                position: absolute;
                padding: 5px 10px;
                background-color: var(--background-color);
                border: var(--border-thickness) solid var(--text-color);
                border-radius: 4px;
                white-space: nowrap;
                font-weight: var(--font-weight-medium);
                transition: color 0.5s;
            }
        </style>
    </head>
    <body>
        <header>
            <table class="header">
                <tbody>
                <tr>
                  <td colspan="2" rowspan="2" class="width-auto">
                    <h1 class="title">Griftless</h1>
                    <span class="subtitle">Engineering discussions without the hustle culture</span>
                  </td>
                  <th>Version</th>
                  <td class="width-min">v1.0.0</td>
                </tr>
                <tr>
                  <th>Updated</th>
                  <td class="width-min"><time datetime="2025-03-23">2025-03-23</time></td>
                </tr>
                <tr>
                  <th class="width-min">Author</th>
                  <td class="width-auto"><a href="https://hame.page"><cite>Hamish Bultitude</cite></a></td>
                  <th class="width-min">Next</th>
                  <td>TBD</td>
                </tr>
              </tbody></table>
        </header>
        <nav aria-label="Main navigation">
            <a href="#about">About</a>
            <a href="#events">Events</a>
            <a href="#speakers">Speakers</a>
            <a href="#register">Register</a>
            <a href="#contact">Contact</a>
        </nav>
        <main class="container">
            <section id="about" aria-labelledby="about-heading">
                <h2 id="about-heading">About Us</h2>
                <p>A meetup getting back to the roots of why we love engineering. No
                    <b>grifting</b> — just sharing knowledge amongst likeminded individuals.
                </p>
                <h3>What this is:</h3>
                <ul>
                    <li>Technical discussions in a low-key setting</li>
                    <li>Show something you learned or built recently</li>
                    <li>Share problems you solved (or are stuck on)</li>
                    <li>Talk about tools, patterns, or languages you find interesting</li>
                    <li>Actual engineering, not entrepreneurship</li>
                </ul>
                <h3>What this isn't:</h3>
                <ul>
                    <li>No pitch practice</li>
                    <li>No "bootcamps" or "anyone can code"</li>
                    <li>No hustle culture</li>
                </ul>
            </section>
            <hr>
            <section id="events" aria-labelledby="events-heading">
                <h2 id="events-heading">Events</h2>
                <div class="event">
                    <p>
                        <strong>Location:</strong> Provided privately to members.
                    </p>
                </div>
                <table>
                    <caption class="sr-only">Upcoming Meetups</caption>
                    <thead>
                        <tr>
                            <th scope="col" class="width-min">
                                Meetup No.
                            </th>
                            <th scope="col" class="width-min">
                                Date
                            </th>
                            <th scope="col" class="width-min">
                                Time
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>
                                1
                            </td>
                            <td>
                                TBD
                            </td>
                            <td>
                                TBD
                            </td>
                        </tr>
                    </tbody>
                </table>
            </section>
            <hr>
            <section id="speakers" aria-labelledby="speakers-heading">
                <h2 id="speakers-heading">Upcoming Speakers</h2>
                <p>Check out who will be speaking at our upcoming meetups.</p>
                
                <div class="speaker-grid">
                    <div class="speaker-card">
                        <div class="speaker-image">
                            <img src="https://avatars.githubusercontent.com/u/18391419?v=4" alt="Hamish Bultitude">
                        </div>
                        <div class="speaker-info">
                            <h3 class="speaker-name">Hamish Bultitude</h3>
                            <p class="speaker-topic">Baby's First CVE 10</p>
                        </div>
                    </div>
                    <div class="speaker-card">
                        <div class="speaker-image">
                            <img src="https://avatars.githubusercontent.com/u/5368490?v=4" alt="Max Bo">
                        </div>
                        <div class="speaker-info">
                            <h3 class="speaker-name">Max Bo</h3>
                            <p class="speaker-topic">ABCD</p>
                        </div>
                    </div>
                </div>
            </section>
            <hr>
            <section id="register" aria-labelledby="register-heading">
                <h2 id="register-heading">Register Interest</h2>
                <p>Submit your details to register interest in attending future meetups.</p>
                
                <div class="registration-form">
                    <form id="registration-form">
                        <div class="form-group">
                            <label for="name">Name:</label>
                            <input type="text" id="name" name="name" required>
                        </div>
                        
                        <div class="form-group">
                            <label for="email">Email:</label>
                            <input type="email" id="email" name="email" required>
                        </div>
                        
                        <div class="form-group speaker-checkbox">
                            <label for="is-speaker" class="checkbox-label">
                                <input type="checkbox" id="is-speaker" name="is_speaker">
                                Register as a speaker
                            </label>
                        </div>
                        
                        <div id="speaker-fields" class="speaker-fields" style="display: none;">
                            <div class="form-group">
                                <label for="topic">Topic:</label>
                                <input type="text" id="topic" name="topic" placeholder="What would you like to speak about?">
                            </div>
                            
                            <div class="form-group">
                                <label for="profile-pic">Profile Picture URL:</label>
                                <input type="url" id="profile-pic" name="profile_pic" placeholder="Link to your profile picture">
                                <small>Please provide a direct link to your profile image (Optional)</small>
                            </div>
                        </div>
                        
                        <button type="submit" class="submit-btn">Register Interest</button>
                    </form>
                    
                    <div class="connection-status">Status: <span id="connection-status">Connecting...</span></div>
                    
                    <div class="participants">
                        <h3>Currently Registered:</h3>
                        <div id="screensaver-container" class="screensaver-container">
                            <!-- Participant names will be animated here -->
                        </div>
                    </div>
                </div>
            </section>
            <hr>
            <section id="contact" aria-labelledby="contact-heading">
                <h2 id="contact-heading">Contact</h2>
                <p>Email: <a href="mailto:hamishgrahambultitude@gmail.com">hamishgrahambultitude@gmail.com</a></p>
                <p>Note that joining is on an invite only basis. Email me if you think you fit the bill otherwise.</p>
            </section>
        </main>
        <footer>
            <hr>
            <p>Thanks to <a href="https://github.com/owickstrom/the-monospace-web" target="_blank" rel="noopener noreferrer">github.com/owickstrom/the-monospace-web</a> for the css.</p>
        </footer>
        
        <script>
            document.addEventListener('DOMContentLoaded', () => {
                const registrationForm = document.getElementById('registration-form');
                const connectionStatus = document.getElementById('connection-status');
                const screensaverContainer = document.getElementById('screensaver-container');
                const isSpeakerCheckbox = document.getElementById('is-speaker');
                const speakerFields = document.getElementById('speaker-fields');
                
                let participants = [];
                let participantElements = [];
                const colors = [
                    '#FF0000', '#00FF00', '#0000FF', '#FFFF00', 
                    '#FF00FF', '#00FFFF', '#FFA500', '#800080'
                ];
                
                // Toggle speaker fields visibility
                isSpeakerCheckbox.addEventListener('change', function() {
                    speakerFields.style.display = this.checked ? 'block' : 'none';
                    
                    // Make topic required only if registering as speaker
                    const topicInput = document.getElementById('topic');
                    topicInput.required = this.checked;
                });
                
                // Handle form submission
                registrationForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const nameInput = document.getElementById('name');
                    const emailInput = document.getElementById('email');
                    const isSpeaker = document.getElementById('is-speaker').checked;
                    const topicInput = document.getElementById('topic');
                    const profilePicInput = document.getElementById('profile-pic');
                    
                    const name = nameInput.value.trim();
                    const email = emailInput.value.trim();
                    const topic = topicInput.value.trim();
                    const profilePic = profilePicInput.value.trim();
                    
                    if (!name || !email) {
                        alert('Please fill out all required fields');
                        return;
                    }
                    
                    if (isSpeaker && !topic) {
                        alert('Topic is required for speakers');
                        return;
                    }
                    
                    try {
                        const response = await fetch('/submit-registration', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ 
                                name, 
                                email, 
                                is_speaker: isSpeaker,
                                topic: isSpeaker ? topic : null,
                                profile_pic: isSpeaker ? profilePic : null
                            }),
                        });
                        
                        if (response.ok) {
                            // Clear the form on success
                            nameInput.value = '';
                            emailInput.value = '';
                            document.getElementById('is-speaker').checked = false;
                            topicInput.value = '';
                            profilePicInput.value = '';
                            speakerFields.style.display = 'none';
                            alert('Registration submitted successfully!');
                        } else {
                            const data = await response.text();
                            alert('Error submitting registration: ' + data);
                        }
                    } catch (error) {
                        console.error('Error:', error);
                        alert('An error occurred while submitting your registration');
                    }
                });
                
                // Create and update the DVD screensaver for participant names
                function updateDvdScreensaver() {
                    // Clear the container
                    while (screensaverContainer.firstChild) {
                        screensaverContainer.removeChild(screensaverContainer.firstChild);
                    }
                    participantElements = [];
                    
                    if (participants.length === 0) {
                        const placeholder = document.createElement('div');
                        placeholder.textContent = 'No registrations yet.';
                        placeholder.style.position = 'absolute';
                        placeholder.style.top = '50%';
                        placeholder.style.left = '50%';
                        placeholder.style.transform = 'translate(-50%, -50%)';
                        screensaverContainer.appendChild(placeholder);
                        return;
                    }
                    
                    // Create elements for each participant
                    participants.forEach((participant, index) => {
                        const element = document.createElement('div');
                        element.className = 'participant-name';
                        element.textContent = participant.name;
                        element.style.color = colors[index % colors.length];
                        
                        // Random starting position
                        const containerWidth = screensaverContainer.clientWidth;
                        const containerHeight = screensaverContainer.clientHeight;
                        
                        // Store the element with its movement data
                        participantElements.push({
                            element,
                            x: Math.random() * (containerWidth - 100),
                            y: Math.random() * (containerHeight - 30),
                            speedX: (Math.random() * 0.5 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
                            speedY: (Math.random() * 0.5 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
                            width: 0,
                            height: 0
                        });
                        
                        screensaverContainer.appendChild(element);
                    });
                    
                    // Get the dimensions of each element after they've been added to the DOM
                    setTimeout(() => {
                        participantElements.forEach(item => {
                            item.width = item.element.offsetWidth;
                            item.height = item.element.offsetHeight;
                        });
                        
                        if (!animationRunning) {
                            animationRunning = true;
                            animateNames();
                        }
                    }, 0);
                }
                
                let animationRunning = false;
                let previousRegistrations = [];
                
                // Initialize SSE connection for real-time updates
                function initEventSource() {
                    connectionStatus.textContent = 'Connecting...';
                    
                    const eventSource = new EventSource('/registration-updates');
                    
                    eventSource.onopen = () => {
                        connectionStatus.textContent = 'Connected';
                    };
                    
                    eventSource.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            
                            if (data.registrations) {
                                // Check if we're just getting new registrations or a full refresh
                                const newParticipants = data.registrations;
                                
                                if (previousRegistrations.length === 0) {
                                    // First load
                                    participants = newParticipants;
                                    updateDvdScreensaver();
                                } else if (newParticipants.length !== previousRegistrations.length) {
                                    // The registration count changed, update but preserve animations
                                    const existingElements = {};
                                    participantElements.forEach(item => {
                                        const name = item.element.textContent;
                                        existingElements[name] = {
                                            x: item.x,
                                            y: item.y,
                                            speedX: item.speedX,
                                            speedY: item.speedY
                                        };
                                    });
                                    
                                    participants = newParticipants;
                                    
                                    // Clear container but keep animation state
                                    while (screensaverContainer.firstChild) {
                                        screensaverContainer.removeChild(screensaverContainer.firstChild);
                                    }
                                    participantElements = [];
                                    
                                    // Recreate elements but maintain positions for existing ones
                                    participants.forEach((participant, index) => {
                                        const element = document.createElement('div');
                                        element.className = 'participant-name';
                                        element.textContent = participant.name;
                                        element.style.color = colors[index % colors.length];
                                        
                                        const containerWidth = screensaverContainer.clientWidth;
                                        const containerHeight = screensaverContainer.clientHeight;
                                        
                                        // Use existing data if we have it
                                        if (existingElements[participant.name]) {
                                            const existing = existingElements[participant.name];
                                            participantElements.push({
                                                element,
                                                x: existing.x,
                                                y: existing.y,
                                                speedX: existing.speedX,
                                                speedY: existing.speedY,
                                                width: 0,
                                                height: 0
                                            });
                                        } else {
                                            // New participant, create new data
                                            participantElements.push({
                                                element,
                                                x: Math.random() * (containerWidth - 100),
                                                y: Math.random() * (containerHeight - 30),
                                                speedX: (Math.random() * 0.5 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
                                                speedY: (Math.random() * 0.5 + 0.2) * (Math.random() > 0.5 ? 1 : -1),
                                                width: 0,
                                                height: 0
                                            });
                                        }
                                        
                                        screensaverContainer.appendChild(element);
                                    });
                                    
                                    // Update element dimensions
                                    setTimeout(() => {
                                        participantElements.forEach(item => {
                                            item.width = item.element.offsetWidth;
                                            item.height = item.element.offsetHeight;
                                        });
                                    }, 0);
                                }
                                
                                // Store current list for next comparison
                                previousRegistrations = [...newParticipants];
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
                
                // Animate the names like a DVD screensaver
                function animateNames() {
                    const containerWidth = screensaverContainer.clientWidth;
                    const containerHeight = screensaverContainer.clientHeight;
                    
                    participantElements.forEach(item => {
                        // Move the element
                        item.x += item.speedX;
                        item.y += item.speedY;
                        
                        // Bounce off the walls
                        if (item.x <= 0 || (item.x + item.width) >= containerWidth) {
                            item.speedX *= -1;
                            item.x = Math.max(0, Math.min(item.x, containerWidth - item.width));
                            item.element.style.color = colors[Math.floor(Math.random() * colors.length)];
                        }
                        
                        if (item.y <= 0 || (item.y + item.height) >= containerHeight) {
                            item.speedY *= -1;
                            item.y = Math.max(0, Math.min(item.y, containerHeight - item.height));
                            item.element.style.color = colors[Math.floor(Math.random() * colors.length)];
                        }
                        
                        // Update the position
                        item.element.style.left = item.x + 'px';
                        item.element.style.top = item.y + 'px';
                    });
                    
                    // Keep animating
                    requestAnimationFrame(animateNames);
                }
                
                // Start the SSE connection
                initEventSource();
                
                // Handle window resize
                window.addEventListener('resize', () => {
                    // Ensure names are still within bounds after resize
                    const containerWidth = screensaverContainer.clientWidth;
                    const containerHeight = screensaverContainer.clientHeight;
                    
                    participantElements.forEach(item => {
                        item.x = Math.min(item.x, containerWidth - item.width);
                        item.y = Math.min(item.y, containerHeight - item.height);
                    });
                });
            });
        </script>
    </body>
</html>`; 