# Kez English Learning App 🎓

An interactive English learning application built with Next.js and OpenAI Realtime API, designed specifically for Kez to practice English through engaging conversations and games.

## Features ✨

### Game Modes
- **💬 Casual Chat**: Natural conversations with instant corrections and tips
- **🎭 Role Play**: Practice English in real-life scenarios  
- **🚫 Taboo Game**: Improve speaking skills through word description games

### Core Functionality
- **🎤 Real-time Voice Conversation**: Direct speech-to-speech with OpenAI GPT-4o-mini
- **📝 Live Transcription**: See conversations in real-time
- **🔧 Smart Corrections**: Gentle, encouraging error correction
- **💡 Micro-tips**: Quick learning insights every few turns
- **💰 Cost Tracking**: Monitor token usage and session costs
- **🎚️ Adjustable Settings**: Speaking speed, microphone sensitivity
- **🎯 Push-to-Talk**: Optional manual microphone control

### Personalized for Kez
- **👋 Personal Addressing**: AI addresses Kez by name
- **🌟 High Energy**: Keeps conversations engaging and fun
- **🎉 Motivational**: Celebrates progress and builds confidence
- **⏰ Patience**: Extended silence duration for thinking time

## Technology Stack 🛠️

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Next.js API Routes
- **AI**: OpenAI Realtime API (GPT-4o-mini-realtime-preview)
- **Audio**: WebRTC, Web Audio API
- **Styling**: CSS-in-JS

## Getting Started 🚀

### Prerequisites
- Node.js 18+ 
- OpenAI API key with Realtime API access

### Installation

1. Clone the repository:
```bash
git clone https://github.com/onuryuksel/kez-english-app.git
cd kez-english-app
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Add your OpenAI API key to `.env.local`:
```
OPENAI_API_KEY=your_openai_api_key_here
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:5001](http://localhost:5001) in your browser

## Usage 📖

1. **Select Game Mode**: Choose between Casual Chat, Role Play, or Taboo Game
2. **Adjust Settings**: Configure speaking speed and microphone options
3. **Start Chat**: Click "Start Chat" and grant microphone permissions
4. **Begin Conversation**: Start speaking - the AI will respond naturally
5. **Monitor Progress**: Watch live transcriptions and track session costs

### Taboo Game Rules
- The AI acts as the guesser
- Kez describes words without using forbidden terms
- AI tries to guess based on descriptions
- Points awarded for successful rounds

## Configuration ⚙️

### Game Mode Prompts
Each game mode has specialized AI prompts in `lib/coachPrompt.ts`:
- Casual: Natural conversation with corrections
- Roleplay: Scenario-based practice
- Taboo: Game-focused guessing interactions

### Audio Settings
- **Voice Activity Detection**: Adjustable sensitivity
- **Silence Duration**: 3.5-4 seconds for thinking time
- **Noise Suppression**: Enabled by default
- **Push-to-Talk**: Optional manual control

## Development 🔧

### Key Files
- `components/RealtimeClient.tsx`: Main conversation interface
- `pages/api/realtime-session.ts`: Session creation endpoint
- `pages/api/realtime-connect.ts`: WebRTC connection proxy
- `lib/coachPrompt.ts`: AI instruction prompts
- `lib/tabooWords.ts`: Word bank for Taboo game

### API Endpoints
- `POST /api/realtime-session`: Create OpenAI session
- `POST /api/realtime-connect`: WebRTC SDP exchange proxy

### Environment Variables
```
OPENAI_API_KEY=your_openai_api_key
OPENAI_ORGANIZATION=your_org_id (optional)
OPENAI_REALTIME_MODEL=gpt-4o-mini-realtime-preview-2024-12-17
```

## Cost Management 💰

The app tracks token usage and displays costs:
- **Input Audio**: $10/1M tokens
- **Output Audio**: $20/1M tokens
- Session summaries show total cost

## Contributing 🤝

This is a personal project for Kez's English learning. If you'd like to contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License 📄

This project is private and intended for personal use.

## Support 💬

For issues or questions, please open an issue on GitHub.

---

Built with ❤️ for Kez's English learning journey! 🌟
