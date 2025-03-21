# NoteFlow

A note-taking application that converts various input formats (images, PDFs, text) into well-structured notes with diagrams and visualizations.

## Project Structure

- **client/** - React frontend
- **server/** - Express backend
- **firebase/** - Firebase configuration

## Setup Instructions

### Prerequisites
- Node.js (v14+ recommended)
- npm
- Firebase account with a project set up

### Firebase Setup
1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication, Firestore, and Storage services
3. Generate a service account key from Project Settings > Service accounts
4. Save the JSON as `server/serviceAccountKey.json`

### Environment Variables
1. Create a `.env` file in the root directory
2. Copy contents from `.env.example` and fill in your Firebase configuration values

### Installation
```bash
# Install all dependencies (root, client, server)
npm run install-all

# Start both client and server
npm start
```

### Frontend Development
```bash
# Start only the React client
npm run client
```

### Backend Development
```bash
# Start only the Express server
npm run server
```

## Features

- User authentication (signup/login)
- Upload files (images, PDFs, text documents)
- Input raw text (transcripts, notes, etc.)
- Generate structured notes with diagrams and flowcharts
- Download processed notes as PDFs

## Technologies Used

- React (Frontend)
- Tailwind CSS (Styling)
- Express (Backend)
- Firebase (Authentication, Database, Storage, Genkit)
- PDF generation library: PDF-lib.
