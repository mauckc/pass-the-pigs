# Pass the Pigs - Web Edition

A modern, web-based implementation of the classic Pass the Pigs dice game built with React, TypeScript, and Tailwind CSS.

## 🎲 Game Overview

Pass the Pigs is a dice game where players roll two pig-shaped dice to score points. The goal is to be the first player to reach a target score (default: 100 points).

### Game Rules (Simplified Classic)

- **On your turn**: Roll two pigs as many times as you like to build Turn Points
- **Hold**: Bank your Turn Points into your total score, then the next player goes
- **Pig Out**: Opposite sides (Left + Right) → 0 points and turn ends immediately
- **Sider**: Same sides (Left + Left or Right + Right) → +1 point
- **Single + Sider**: One special + one sider → score the special's value
- **Two specials**: Add values. If they match, score double the sum

### Scoring Values

- **Razorback**: 5 points
- **Trotter**: 5 points  
- **Snouter**: 10 points
- **Leaning Jowler**: 15 points
- **Sider (same sides)**: 1 point
- **Pig Out (opposite sides)**: 0 points and end turn
- **Double (e.g., Double Snouter)**: (value + value) × 2

### Final Round Rule

When a player holds at or above the target, every other player gets exactly one more turn to beat the top score. Then the highest score wins.

## 🚀 Features

- **Modern UI**: Clean, responsive design with Tailwind CSS
- **Customizable**: Adjust outcome weights for different difficulty levels
- **Player Management**: Add/remove players, customize names
- **Settings**: Toggle confetti on win, roll hints, and more
- **Responsive**: Works on desktop and mobile devices
- **Local Storage**: Game state persists between sessions

## 🛠️ Tech Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Animations**: Framer Motion
- **Icons**: Lucide React

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/mauckc/pass-the-pigs.git
   cd pass-the-pigs
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

### Build for Production
```bash
npm run build
npm run preview
```

## 🎮 How to Play

1. **Setup**: Add players, set target score, and click "Start Game"
2. **Your Turn**: Click "Roll" to roll the pigs and accumulate Turn Points
3. **Strategy**: Decide whether to continue rolling or "Hold" to bank points
4. **Risk**: Rolling risks a "Pig Out" that ends your turn with 0 points
5. **Win**: Be the first to reach the target score and survive the Final Round

## 🔧 Configuration

### Outcome Weights
Adjust the probability of different pig poses in the Settings panel:
- Higher numbers = more likely to occur
- Values are automatically normalized
- Default settings provide an "arcade-like" experience

### Game Settings
- **Confetti on win**: Enable celebration animations
- **Show roll hints**: Display helpful game tips
- **Target score**: Customize the winning condition

## 📁 Project Structure

```
src/
├── components/
│   └── ui/           # Reusable UI components
├── lib/
│   └── utils.ts      # Utility functions
├── App.tsx           # Main game component
├── main.tsx          # App entry point
└── index.css         # Tailwind CSS imports
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This is an unofficial implementation of Pass the Pigs. Not affiliated with the official Pass the Pigs® game.

---

Built with ❤️ using React + Tailwind CSS
