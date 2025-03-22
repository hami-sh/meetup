# Griftless Meetup Val

A simple Val-based application for the Griftless engineering meetup. This application allows users to register their interest in attending future meetups and displays a list of registered participants in real-time.

## Features

- Static website with monospace-inspired design
- SQLite database for storing registrations
- Real-time updates using Server-Sent Events (SSE)
- Responsive design that works on all devices

## How to Use

1. Deploy this file to your Val hosting platform
2. The Val will automatically create a SQLite database to store registrations
3. Users can submit their name and email to register interest
4. The list of registered participants updates in real-time

## Development

The application is structured as a single JavaScript file that:

1. Sets up a SQLite database for storing registrations
2. Handles different routes (main page, CSS files, registration submissions, and SSE updates)
3. Embeds all HTML and CSS content as constants

To modify:
- Edit the HTML_CONTENT constant to change the main page
- Edit the MAIN_CSS constant to change styles
- Modify the database schema in initializeDatabase() function if needed

## License

© Hamish Bultitude 