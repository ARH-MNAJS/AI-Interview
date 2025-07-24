# CCInterview

An AI-powered interview platform with open-source services for speech-to-text, text-to-speech, and LLM capabilities.

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# ================================
# FIREBASE CONFIGURATION (Required)
# ================================
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour\nPrivate\nKey\nHere\n-----END PRIVATE KEY-----\n"

# Client-side Firebase config
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-firebase-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef123456

# ================================
# AI SERVICES CONFIGURATION
# ================================
NEXT_PUBLIC_EDGE_TTS_URL=https://dyptts.ccxai.uk
NEXT_PUBLIC_WHISPER_STT_URL=https://dypstt.ccxai.uk
NEXT_PUBLIC_OLLAMA_URL=https://dypai.ccxai.uk
NEXT_PUBLIC_OLLAMA_MODEL=gemma3:latest
OLLAMA_INTERNAL_URL=https://dypai.ccxai.uk
```

### 3. Firebase Setup

1. **Create a Firebase Project**: Go to [Firebase Console](https://console.firebase.google.com)
2. **Enable Authentication**: Enable Email/Password authentication
3. **Create Firestore Database**: Set up in production mode
4. **Generate Service Account**:
   - Go to Project Settings → Service Accounts
   - Generate new private key
   - Copy the values to your `.env.local`

### 4. Start Development Server
```bash
npm run dev
```

Your app will be available at `http://localhost:3001`

## 🛠️ Services

This application uses the following services:

- **TTS (Text-to-Speech)**: Edge TTS for voice synthesis
- **STT (Speech-to-Text)**: Whisper for transcription  
- **LLM**: Ollama with Gemma model for AI responses
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth

## 🔧 Troubleshooting

### Build Errors

If you see Firebase-related build errors:

1. **Missing Environment Variables**: Ensure all Firebase variables are set in `.env.local`
2. **Invalid Private Key**: Make sure the private key includes `\n` for newlines
3. **Project ID Mismatch**: Verify your Firebase project ID is correct

### CORS Issues

The app automatically handles CORS by routing Ollama requests through `/api/ollama-proxy`. No additional configuration needed.

## 📁 Project Structure

```
CCInterview/
├── app/                    # Next.js app directory
├── components/             # React components
├── lib/                   # Utilities and services
│   ├── actions/          # Server actions
│   ├── services/         # AI service adapters
│   └── config/           # Configuration
├── firebase/             # Firebase configuration
└── types/               # TypeScript definitions
```

## 🚀 Deployment

1. Set environment variables in your deployment platform
2. Build the application: `npm run build`
3. Deploy to your preferred platform (Vercel, Netlify, etc.)

Make sure all environment variables are properly configured in your deployment environment. 