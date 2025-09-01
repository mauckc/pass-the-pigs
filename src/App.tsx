import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Dice6, Plus, RefreshCcw, Settings, Trophy } from "lucide-react";
import confetti from "canvas-confetti";

// ---------------------------------------------
// Pass the Pigs — Single-file React game (TypeScript)
// Includes a "Final Round" (one-last-turn) rule.
// ---------------------------------------------

// Types
export type PigPose =
  | "Sider-Left"
  | "Sider-Right"
  | "Razorback"
  | "Trotter"
  | "Snouter"
  | "Leaning Jowler";

export type DiePig = { pose: PigPose };

export type Roll = {
  pigs: [DiePig, DiePig];
  points: number;
  event: string;
};

type Player = { id: string; name: string; score: number };

type ScoreEntry = {
  playerId: string;
  playerName: string;
  turnNumber: number;
  previousScore: number;
  newScore: number;
  pointsEarned: number;
  action: 'hold' | 'pass_pigs';
  timestamp: number;
};

type GameState = {
  started: boolean;
  target: number;
  players: Player[];
  currentIndex: number;
  turnPoints: number;
  history: Roll[]; // current-turn history
  scoreHistory: ScoreEntry[]; // track all score changes over turns
  currentTurnNumber: number;
  settings: {
    weights: Record<PigPose, number>;
    confettiOnWin: boolean;
    confettiOnSpecialRolls: boolean;
    showRollHints: boolean;
    soundEffects: boolean;
    showPoseBadges: boolean;
    fastRollMode: boolean;
  };
  // Final-round state
  finalRound: boolean; // true once someone Holds >= target
  finalLeaderIndex: number | null; // who triggered final round
  finalLeaderScore: number; // score to beat
  finalTurns: Record<string, boolean> | null; // playerId -> took last chance
  // Pass the pigs state
  needsToPassPigs: boolean; // true when player needs to click "Pass the Pigs" after getting pigs out
};

// Scoring values
const POSE_VALUES: Record<PigPose, number> = {
  "Sider-Left": 0, // used only in sider/sider logic
  "Sider-Right": 0,
  Razorback: 5,
  Trotter: 5,
  Snouter: 10,
  "Leaning Jowler": 15,
};

// Default outcome weights (rough / arcade-like)
const DEFAULT_WEIGHTS: Record<PigPose, number> = {
  "Sider-Left": 34.9,
  "Sider-Right": 30.2,
  Razorback: 22.4,
  Trotter: 8.8,
  Snouter: 3,
  "Leaning Jowler": 0.7,
};

// Local storage key
const STORAGE_KEY = "pass-the-pigs-v1";

// Sound effects using Web Audio API
const createSound = (frequency: number, duration: number, type: OscillatorType = 'sine') => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

const playRollSound = () => {
  // Rolling sound - multiple frequencies
  createSound(200, 0.1, 'sawtooth');
  setTimeout(() => createSound(300, 0.1, 'sawtooth'), 50);
  setTimeout(() => createSound(400, 0.1, 'sawtooth'), 100);
  setTimeout(() => createSound(500, 0.1, 'sawtooth'), 150);
};

const playLandingSound = () => {
  // Landing sound - quick burst
  createSound(600, 0.05, 'square');
  setTimeout(() => createSound(400, 0.1, 'sine'), 20);
};

const playSpecialSound = () => {
  // Special roll sound - ascending notes
  createSound(440, 0.1, 'sine'); // A4
  setTimeout(() => createSound(554, 0.1, 'sine'), 100); // C#5
  setTimeout(() => createSound(659, 0.1, 'sine'), 200); // E5
  setTimeout(() => createSound(880, 0.2, 'sine'), 300); // A5
};

const playPigOutSound = () => {
  // Pig out sound - descending notes
  createSound(440, 0.1, 'sine'); // A4
  setTimeout(() => createSound(392, 0.1, 'sine'), 100); // G4
  setTimeout(() => createSound(349, 0.1, 'sine'), 200); // F4
  setTimeout(() => createSound(294, 0.2, 'sine'), 300); // D4
};

// Particle effect system
const createParticles = (count: number, x: number, y: number, colors: string[]) => {
  const newParticles = [];
  for (let i = 0; i < count; i++) {
    newParticles.push({
      id: Math.random(),
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      life: 1,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }
  return newParticles;
};

// Helpers
const randWeighted = (weights: Record<PigPose, number>): PigPose => {
  const entries = Object.entries(weights) as [PigPose, number][];
  const total = entries.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = Math.random() * total;
  for (const [pose, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return pose;
  }
  return entries[entries.length - 1][0];
};

// Trigger confetti for special dice combinations
const triggerConfetti = (pose1: PigPose, pose2: PigPose, enabled: boolean) => {
  if (!enabled) return;
  
  // Get viewport dimensions for responsive positioning
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const isMobile = viewportWidth < 768; // Tailwind's md breakpoint
  
  // Adjust confetti positioning for mobile vs desktop
  const centerY = isMobile ? 0.5 : 0.6; // More centered on mobile
  const leftX = isMobile ? 0.3 : 0.2;   // Closer to center on mobile
  const rightX = isMobile ? 0.7 : 0.8;  // Closer to center on mobile
  
  // Check for double special poses
  if (pose1 === pose2 && (pose1 === "Razorback" || pose1 === "Trotter" || pose1 === "Snouter")) {
    // Multiple bursts for double specials
    setTimeout(() => confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: centerY },
      colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
    }), 100);
    
    setTimeout(() => confetti({
      particleCount: 100,
      spread: 50,
      origin: { x: leftX, y: centerY },
      colors: ['#FF6B6B', '#4ECDC4', '#45B7D1']
    }), 300);
    
    setTimeout(() => confetti({
      particleCount: 100,
      spread: 50,
      origin: { x: rightX, y: centerY },
      colors: ['#96CEB4', '#FFEAA7', '#DDA0DD']
    }), 500);
    return;
  }
  
  // Check for any Leaning Jowler
  if (pose1 === "Leaning Jowler" || pose2 === "Leaning Jowler") {
    // Golden shower for Leaning Jowler
    confetti({
      particleCount: 200,
      spread: 80,
      origin: { y: centerY },
      colors: ['#FFD700', '#FFA500', '#FF6347', '#FF69B4', '#FF1493'],
      shapes: ['star', 'circle'],
      scalar: 1.2
    });
    
    // Additional burst
    setTimeout(() => confetti({
      particleCount: 100,
      spread: 60,
      origin: { y: centerY - 0.1 }, // Slightly higher
      colors: ['#FFD700', '#FFA500'],
      shapes: ['star']
    }), 200);
    return;
  }
  
  // Individual confetti for single special poses (smaller but scaled by power)
  const specialPoses = ["Razorback", "Trotter", "Snouter"];
  const pose1IsSpecial = specialPoses.includes(pose1);
  const pose2IsSpecial = specialPoses.includes(pose2);
  
  if (pose1IsSpecial || pose2IsSpecial) {
    // Determine the most powerful special pose for confetti intensity
    const getPosePower = (pose: PigPose) => {
      switch (pose) {
        case "Razorback": return 1; // Lowest power
        case "Trotter": return 2;   // Medium power
        case "Snouter": return 3;   // Highest power
        default: return 0;
      }
    };
    
    const pose1Power = getPosePower(pose1);
    const pose2Power = getPosePower(pose2);
    const maxPower = Math.max(pose1Power, pose2Power);
    
    // Scale confetti based on power level
    const baseParticleCount = 15;
    const particleCount = baseParticleCount + (maxPower * 5); // 15, 20, 30
    const spread = 40 + (maxPower * 10); // 40, 50, 60
    const scalar = 0.8 + (maxPower * 0.1); // 0.8, 0.9, 1.0
    
    // Color scheme based on the most powerful pose
    let colors: string[];
    if (maxPower === 3) { // Snouter
      colors = ['#8B5CF6', '#A855F7', '#C084FC', '#DDD6FE']; // Purple theme
    } else if (maxPower === 2) { // Trotter
      colors = ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0']; // Green theme
    } else { // Razorback
      colors = ['#EF4444', '#F87171', '#FCA5A5', '#FECACA']; // Red theme
    }
    
    // Small confetti burst for individual special poses
    confetti({
      particleCount,
      spread,
      origin: { y: centerY },
      colors,
      scalar,
      shapes: ['circle']
    });
  }
};

const poseLabelShort: Record<PigPose, string> = {
  "Sider-Left": "Sider L",
  "Sider-Right": "Sider R",
  Razorback: "Razorback",
  Trotter: "Trotter",
  Snouter: "Snouter",
  "Leaning Jowler": "Jowler",
};

// Score a pair of pigs according to simplified classic rules
function scorePair(a: PigPose, b: PigPose): { points: number; event: string } {
  const isSider = (p: PigPose) => p === "Sider-Left" || p === "Sider-Right";

  // Pig Out: opposite siders
  if (
    (a === "Sider-Left" && b === "Sider-Right") ||
    (a === "Sider-Right" && b === "Sider-Left")
  ) {
    return { points: 0, event: "Pig Out — turn ends" };
  }

  // Sider + Sider (same side) → 1 point
  if (
    (a === "Sider-Left" && b === "Sider-Left") ||
    (a === "Sider-Right" && b === "Sider-Right")
  ) {
    return { points: 1, event: "Sider (same sides)" };
  }

  // If exactly one is a sider → score the other pose's value
  if (isSider(a) && !isSider(b)) return { points: POSE_VALUES[b], event: `${b} (+${POSE_VALUES[b]})` };
  if (!isSider(a) && isSider(b)) return { points: POSE_VALUES[a], event: `${a} (+${POSE_VALUES[a]})` };

  // Both are non-siders
  if (a === b) {
    const base = POSE_VALUES[a] + POSE_VALUES[b];
    return { points: base * 2, event: `Double ${a} (+${base * 2})` };
  }
  const sum = POSE_VALUES[a] + POSE_VALUES[b];
  return { points: sum, event: `${a} + ${b} (+${sum})` };
}

// Persisted state hook with migration support
function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      
      const parsed = JSON.parse(raw) as any;
      
      // Migration logic for existing saved games
      if (parsed && typeof parsed === 'object') {
        // Add missing scoreHistory field if it doesn't exist
        if (!parsed.scoreHistory) {
          parsed.scoreHistory = [];
        }
        // Add missing currentTurnNumber field if it doesn't exist
        if (typeof parsed.currentTurnNumber !== 'number') {
          parsed.currentTurnNumber = 1;
        }
        // Add missing fastRollMode field if it doesn't exist
        if (parsed.settings && typeof parsed.settings.fastRollMode !== 'boolean') {
          parsed.settings.fastRollMode = false;
        }
      }
      
      return parsed as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

const PigEmoji: React.FC<{ pose: PigPose; i: number; rolling?: boolean; anticipating?: boolean; showBadge?: boolean; fastRollMode?: boolean }> = ({ pose, i, rolling, anticipating, showBadge = false, fastRollMode = false }) => {
  const previousPoseRef = useRef(pose);
  
  // Update previous pose when not rolling
  if (!rolling && !anticipating) {
    previousPoseRef.current = pose;
  }

  const variants: Record<PigPose, { rotate: number; y: number; x: number; scale?: number }> = {
    "Sider-Left": { rotate: -90, y: 8, x: -10 },
    "Sider-Right": { rotate: 90, y: 8, x: 10 },
    Razorback: { rotate: -180, y: 16, x: 0, scale: 1.05 }, // Pig on its back
    Trotter: { rotate: 0, y: -20, x: 0, scale: 1.05 }, // Pig on front legs
    Snouter: { rotate: -45, y: -6, x: 6, scale: 1.05 }, // Pig on snout
    "Leaning Jowler": { rotate: 45, y: -2, x: 12, scale: 1.1 }, // Pig leaning on ear
  };

  // Color schemes for each pose
  const poseColors: Record<PigPose, { bg: string; border: string; indicator: string }> = {
    "Sider-Left": { bg: "bg-gray-100", border: "border-gray-300", indicator: "bg-gray-500" },
    "Sider-Right": { bg: "bg-gray-100", border: "border-gray-300", indicator: "bg-gray-500" },
    Razorback: { bg: "bg-red-100", border: "border-red-300", indicator: "bg-red-500" },
    Trotter: { bg: "bg-green-100", border: "border-green-300", indicator: "bg-green-500" },
    Snouter: { bg: "bg-purple-100", border: "border-purple-300", indicator: "bg-purple-500" },
    "Leaning Jowler": { bg: "bg-orange-100", border: "border-orange-300", indicator: "bg-orange-500" },
  };

  // Pose-specific indicators
  const poseIndicators: Record<PigPose, string> = {
    "Sider-Left": "◀",
    "Sider-Right": "▶", 
    Razorback: "▼",
    Trotter: "▲",
    Snouter: "◆",
    "Leaning Jowler": "★",
  };

  const currentV = variants[pose];
  const previousV = variants[previousPoseRef.current];
  const colors = poseColors[pose];
  const indicator = poseIndicators[pose];

  return (
    <motion.div
      className="relative text-6xl select-none"
      initial={{ y: -60, rotate: (i ? -1 : 1) * 45, opacity: 0.2 }}
      animate={rolling ? { 
        y: [0, 0, 0, 0, -35, 20, -15, 10, -5, currentV.y], 
        rotate: [0, 0, 0, 0, 90, -45, 135, -30, 45, currentV.rotate], 
        scale: [1, 1, 1, 1, 1.1, 0.9, 1.05, 0.95, 1.02, currentV.scale || 1],
        x: [0, 0, 0, 0, i ? 8 : -8, i ? -6 : 6, i ? 5 : -5, i ? -3 : 3, i ? 2 : -2, currentV.x],
        opacity: [1, 1, 1, 1, 0.8, 0.2, 0.8, 0.9, 0.95, 1],
        filter: [
          "drop-shadow(0 0 0 rgba(0,0,0,0))", 
          "drop-shadow(0 0 0 rgba(0,0,0,0))",
          "drop-shadow(0 0 0 rgba(0,0,0,0))",
          "drop-shadow(0 0 0 rgba(0,0,0,0))",
          "drop-shadow(0 4px 8px rgba(0,0,0,0.3))", 
          "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
          "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
          "drop-shadow(0 0 0 rgba(0,0,0,0))"
        ],
        skewX: [0, 0, 0, 0, 2, -2, 1, -1, 0.5, 0],
        skewY: [0, 0, 0, 0, 1, -1, 0.5, -0.5, 0, 0]
      } : anticipating ? {
        y: [previousV.y, 0, -5, 0],
        rotate: [previousV.rotate, 0, 3, -3, 0],
        scale: [previousV.scale || 1, 1, 1.05, 1],
        x: [previousV.x, 0, i ? 2 : -2, 0],
        opacity: 1
      } : { ...currentV, opacity: 1 }}
      layout={false}
      transition={{ 
        duration: rolling ? (fastRollMode ? 0.9 : 1.8) : anticipating ? (fastRollMode ? 0.15 : 0.3) : 0.35, 
        ease: rolling ? [0.25, 0.1, 0.25, 1] : anticipating ? "easeInOut" : "easeOut",
        times: rolling ? [0, 0.08, 0.15, 0.25, 0.4, 0.6, 0.8, 0.92, 0.98, 1] : undefined,
        repeat: anticipating ? Infinity : undefined,
        repeatType: anticipating ? "reverse" : undefined
      }}
      whileHover={rolling || anticipating ? {} : { scale: 1.05, transition: { duration: 0.1 } }}
    >
      {/* Pose indicator badge - only show when not rolling and showBadge is true */}
      {!rolling && showBadge && (
        <div 
          className={`absolute w-4 h-4 rounded-full ${colors.indicator} bg-opacity-70 text-white text-[8px] flex items-center justify-center font-medium z-10`}
          style={{
            top: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        >
          {indicator}
        </div>
      )}
      
      {/* Main pig emoji with enhanced rolling animation */}
      <motion.div 
        className="relative"
        animate={rolling ? {
          y: [0, -3, 0],
          rotate: [0, 5, -5, 0],
          scale: [1, 1.02, 0.98, 1]
        } : {}}
        transition={rolling ? {
          duration: 0.4,
          ease: "easeInOut",
          repeat: 3,
          repeatType: "reverse"
        } : {}}
      >
        🐖
      </motion.div>
      
      {/* Rolling trail effect */}
      {rolling && (
        <motion.div
          className="absolute inset-0 text-6xl opacity-15"
          animate={{
            y: [0, -15, 0],
            rotate: [0, 180],
            scale: [1, 0.9, 1]
          }}
                  transition={{
          duration: fastRollMode ? 0.45 : 0.9,
          ease: "easeInOut",
          repeat: 2,
          repeatType: "reverse"
        }}
        >
          🐖
        </motion.div>
      )}
    </motion.div>
  );
};

const ScoreBadge: React.FC<{ pose: PigPose }> = ({ pose }) => {
  // Color schemes for each pose (matching the pig colors)
  const poseColors: Record<PigPose, { bg: string; text: string; border: string }> = {
    "Sider-Left": { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
    "Sider-Right": { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" },
    Razorback: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
    Trotter: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
    Snouter: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-300" },
    "Leaning Jowler": { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  };

  // Pose-specific icons
  const poseIcons: Record<PigPose, string> = {
    "Sider-Left": "◀",
    "Sider-Right": "▶",
    Razorback: "▼",
    Trotter: "▲",
    Snouter: "◆",
    "Leaning Jowler": "★",
  };

  const colors = poseColors[pose];
  const icon = poseIcons[pose];

  return (
    <Badge 
      variant="secondary" 
      className={`font-mono border ${colors.bg} ${colors.text} ${colors.border} flex items-center gap-1`}
    >
      <span className="text-xs">{icon}</span>
      {poseLabelShort[pose]}
    </Badge>
  );
};

// --------------------- INTERNAL TESTS ----------------------
function runInternalTests() {
  // Scoring sanity checks
  console.assert(scorePair("Sider-Left", "Sider-Right").points === 0, "Pig Out should be 0");
  console.assert(scorePair("Sider-Left", "Sider-Left").points === 1, "Same sider should be 1");
  console.assert(scorePair("Trotter", "Sider-Left").points === 5, "Single + sider should use special value");
  console.assert(scorePair("Snouter", "Snouter").points === 40, "Double Snouter should be 40");
  console.assert(scorePair("Razorback", "Trotter").points === 10, "Two specials should sum");
}

// ScoreHistory component to display player scores over turns/rounds
const ScoreHistory: React.FC<{ scoreHistory: ScoreEntry[]; players: Player[] }> = ({ scoreHistory, players }) => {
  if (!scoreHistory || scoreHistory.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Score History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No score changes yet. Start playing to see the history!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Group score entries by turn number with safety checks
  const turnsByNumber = (scoreHistory || []).reduce((acc, entry) => {
    // Safety check: ensure entry is valid and has required properties
    if (!entry || typeof entry.turnNumber !== 'number' || !entry.playerId) {
      return acc;
    }
    
    if (!acc[entry.turnNumber]) {
      acc[entry.turnNumber] = [];
    }
    acc[entry.turnNumber].push(entry);
    return acc;
  }, {} as Record<number, ScoreEntry[]>);

  const turnNumbers = Object.keys(turnsByNumber).map(Number).sort((a, b) => b - a); // Most recent first

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Score History
                     <Badge variant="secondary" className="ml-2">
             {scoreHistory?.length || 0} change{(scoreHistory?.length || 0) === 1 ? '' : 's'}
           </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-h-96 overflow-auto space-y-4">
          {turnNumbers.map((turnNumber) => {
            const turnEntries = turnsByNumber[turnNumber];
            const turnStartTime = Math.min(...turnEntries.map(e => e.timestamp));
            const turnEndTime = Math.max(...turnEntries.map(e => e.timestamp));
            
            return (
              <div key={turnNumber} className="border rounded-lg p-3 bg-amber-50/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      Turn {turnNumber}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(turnStartTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {turnEntries.length} action{turnEntries.length === 1 ? '' : 's'}
                  </div>
                </div>
                
                <div className="space-y-2">
                  {turnEntries
                    .filter(entry => entry && entry.playerId && typeof entry.pointsEarned === 'number') // Safety filter
                    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
                    .map((entry, idx) => {
                      const player = players.find(p => p.id === entry.playerId);
                      const isPositive = entry.pointsEarned > 0;
                      const isZero = entry.pointsEarned === 0;
                      
                      return (
                        <div key={`${entry.playerId}-${entry.timestamp}`} className="flex items-center justify-between bg-white rounded-lg p-2 border">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-xs font-bold">
                              {players.findIndex(p => p.id === entry.playerId) + 1}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{entry.playerName}</div>
                              <div className="text-xs text-muted-foreground">
                                {entry.action === 'hold' ? 'Held points' : 'Passed pigs'}
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <div className={`font-bold text-sm ${
                              isPositive ? 'text-green-600' : 
                              isZero ? 'text-gray-500' : 
                              'text-red-600'
                            }`}>
                              {isPositive ? `+${entry.pointsEarned}` : 
                               isZero ? '0' : 
                               entry.pointsEarned}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {entry.previousScore} → {entry.newScore}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
        
                 {(scoreHistory?.length || 0) > 0 && (
           <div className="mt-4 pt-3 border-t">
             <div className="text-xs text-muted-foreground text-center">
               Showing {scoreHistory?.length || 0} score change{(scoreHistory?.length || 0) === 1 ? '' : 's'} across {turnNumbers.length} turn{turnNumbers.length === 1 ? '' : 's'}
             </div>
           </div>
         )}
      </CardContent>
    </Card>
  );
};

// --------------------- COMPONENT ----------------------
export default function App() {
  const defaultPlayers: Player[] = [
    { id: crypto.randomUUID(), name: "Player 1", score: 0 },
    { id: crypto.randomUUID(), name: "Player 2", score: 0 },
  ];

  const defaultState: GameState = {
    started: false,
    target: 100,
    players: defaultPlayers,
    currentIndex: 0,
    turnPoints: 0,
    history: [],
    scoreHistory: [],
    currentTurnNumber: 1,
    settings: {
      weights: { ...DEFAULT_WEIGHTS },
      confettiOnWin: true,
      confettiOnSpecialRolls: true,
      showRollHints: true,
      soundEffects: true,
      showPoseBadges: false,
      fastRollMode: false,
    },
    finalRound: false,
    finalLeaderIndex: null,
    finalLeaderScore: 0,
    finalTurns: null,
    needsToPassPigs: false,
  };

  const [state, setState] = useLocalState<GameState>(STORAGE_KEY, defaultState);
  const [rolling, setRolling] = useState(false);
  const [anticipating, setAnticipating] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; vx: number; vy: number; life: number; color: string }>>([]);

  useEffect(() => {
    runInternalTests();
  }, []);

  // Particle animation effect
  useEffect(() => {
    if (particles.length === 0) return;
    
    const interval = setInterval(() => {
      setParticles(prev => 
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.2, // gravity
            life: p.life - 0.02
          }))
          .filter(p => p.life > 0)
      );
    }, 16); // ~60fps
    
    return () => clearInterval(interval);
  }, [particles.length]);

  const finalDone = Boolean(
    state.finalRound && state.finalTurns && Object.values(state.finalTurns).every(Boolean)
  );

  const winner = finalDone
    ? state.players.reduce<Player | null>((best, p) => (!best || p.score > best.score ? p : best), null)
    : null;

  const startGame = () => setState((s) => ({ ...s, started: true }));

  const resetGame = (hard = false) => {
    setState((s) => ({
      ...defaultState,
      players: hard
        ? [
            { id: crypto.randomUUID(), name: "Player 1", score: 0 },
            { id: crypto.randomUUID(), name: "Player 2", score: 0 },
          ]
        : s.players.map((p) => ({ ...p, score: 0 })),
      target: s.target,
      settings: s.settings,
      started: false,
      needsToPassPigs: false,
      scoreHistory: [],
      currentTurnNumber: 1,
    }));
  };

  const roll = async () => {
    if (rolling || winner) return;
    
    // Start anticipation phase
    setAnticipating(true);
    const anticipationDelay = state.settings.fastRollMode ? 150 : 300;
    await new Promise((r) => setTimeout(r, anticipationDelay));
    
    // Start rolling phase
    setAnticipating(false);
    setRolling(true);
    
    // Play rolling sound
    if (state.settings.soundEffects) {
      playRollSound();
    }
    
    // Add rolling delay
    const rollingDelay = state.settings.fastRollMode ? 600 : 1200;
    await new Promise((r) => setTimeout(r, rollingDelay));
    
    const a = randWeighted(state.settings.weights);
    const b = randWeighted(state.settings.weights);
    const { points, event } = scorePair(a, b);

    // Play landing sound
    if (state.settings.soundEffects) {
      playLandingSound();
    }

    // Play special sounds and trigger confetti for special combinations
    const pigOut = event.startsWith("Pig Out");
    const isSpecial = points > 5 || (a === b && a !== "Sider-Left" && a !== "Sider-Right");
    
    if (state.settings.soundEffects) {
      if (pigOut) {
        playPigOutSound();
      } else if (isSpecial) {
        playSpecialSound();
      }
    }

    // Add particle effects for special rolls
    if (isSpecial) {
      const newParticles = createParticles(15, 400, 200, ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']);
      setParticles(prev => [...prev, ...newParticles]);
    } else if (pigOut) {
      const newParticles = createParticles(10, 400, 200, ['#E74C3C', '#C0392B', '#8E44AD']);
      setParticles(prev => [...prev, ...newParticles]);
    }

    triggerConfetti(a, b, state.settings.confettiOnSpecialRolls);

    setState((s) => {
      const newHistory: Roll[] = [
        ...s.history,
        { pigs: [{ pose: a }, { pose: b }] as [DiePig, DiePig], points, event },
      ];
      if (!pigOut) {
        return { ...s, history: newHistory, turnPoints: s.turnPoints + points };
      }
      // Pig Out - player needs to click "Pass the Pigs" to continue
      return {
        ...s,
        history: newHistory,
        needsToPassPigs: true,
      };
    });

    setRolling(false);
  };

  const passThePigs = () => {
    if (rolling || winner || !state.needsToPassPigs) return;
    setState((s) => {
      // End the turn and move to next player
      const curId = s.players[s.currentIndex].id;
      const currentPlayer = s.players[s.currentIndex];
      const nextIndex = (s.currentIndex + 1) % s.players.length;
      let finalTurns = s.finalTurns ? { ...s.finalTurns } : null;
      if (s.finalRound && finalTurns) {
        finalTurns[curId] = true; // used their last chance
      }
      
      // Record score change (0 points earned from passing pigs)
      const scoreEntry: ScoreEntry = {
        playerId: curId,
        playerName: currentPlayer.name,
        turnNumber: s.currentTurnNumber,
        previousScore: currentPlayer.score,
        newScore: currentPlayer.score, // No change in score
        pointsEarned: 0,
        action: 'pass_pigs',
        timestamp: Date.now(),
      };
      
      return {
        ...s,
        history: [],
        turnPoints: 0,
        currentIndex: nextIndex,
        finalTurns,
        needsToPassPigs: false,
        scoreHistory: [...s.scoreHistory, scoreEntry],
        currentTurnNumber: nextIndex === 0 ? s.currentTurnNumber + 1 : s.currentTurnNumber,
      };
    });
  };

  const hold = () => {
    if (rolling || winner) return;
    setState((s) => {
      // Bank points
      const players = s.players.map((p, i) =>
        i === s.currentIndex ? { ...p, score: p.score + s.turnPoints } : p
      );
      const me = players[s.currentIndex];
      const newScore = me.score;
      const previousScore = s.players[s.currentIndex].score;
      const pointsEarned = s.turnPoints;

      // Record score change
      const scoreEntry: ScoreEntry = {
        playerId: me.id,
        playerName: me.name,
        turnNumber: s.currentTurnNumber,
        previousScore,
        newScore,
        pointsEarned,
        action: 'hold',
        timestamp: Date.now(),
      };

      // If not yet in final round and player reached target, trigger final round
      if (!s.finalRound && newScore >= s.target) {
        const turns: Record<string, boolean> = {};
        for (const p of players) turns[p.id] = false;
        turns[me.id] = true; // the triggering player does not get another chance
        const nextIndex = (s.currentIndex + 1) % players.length;
        return {
          ...s,
          players,
          turnPoints: 0,
          history: [],
          currentIndex: nextIndex,
          finalRound: true,
          finalLeaderIndex: s.currentIndex,
          finalLeaderScore: newScore,
          finalTurns: turns,
          needsToPassPigs: false,
          scoreHistory: [...s.scoreHistory, scoreEntry],
          currentTurnNumber: nextIndex === 0 ? s.currentTurnNumber + 1 : s.currentTurnNumber,
        };
      }

      // Already in final round: bank, mark this player's final turn as used
      if (s.finalRound && s.finalTurns) {
        const turns = { ...s.finalTurns };
        turns[me.id] = true;
        const nextIndex = (s.currentIndex + 1) % players.length;
        return {
          ...s,
          players,
          turnPoints: 0,
          history: [],
          currentIndex: nextIndex,
          finalTurns: turns,
          finalLeaderScore: Math.max(s.finalLeaderScore, newScore),
          needsToPassPigs: false,
          scoreHistory: [...s.scoreHistory, scoreEntry],
          currentTurnNumber: nextIndex === 0 ? s.currentTurnNumber + 1 : s.currentTurnNumber,
        };
      }

      // Normal hold (no final round yet and below target)
      return {
        ...s,
        players,
        turnPoints: 0,
        history: [],
        currentIndex: (s.currentIndex + 1) % s.players.length,
        needsToPassPigs: false,
        scoreHistory: [...s.scoreHistory, scoreEntry],
        currentTurnNumber: ((s.currentIndex + 1) % s.players.length) === 0 ? s.currentTurnNumber + 1 : s.currentTurnNumber,
      };
    });
  };

  const addPlayer = () => {
    setState((s) => ({
      ...s,
      players: [...s.players, { id: crypto.randomUUID(), name: `Player ${s.players.length + 1}`, score: 0 }],
    }));
  };

  const removePlayer = (id: string) => {
    setState((s) => ({
      ...s,
      players: s.players.filter((p) => p.id !== id),
      currentIndex: 0,
    }));
  };

  const updateWeight = (pose: PigPose, val: number) => {
    setState((s) => ({ ...s, settings: { ...s.settings, weights: { ...s.settings.weights, [pose]: val } } }));
  };

  const resetWeightsToDefault = () => {
    setState((s) => ({ ...s, settings: { ...s.settings, weights: { ...DEFAULT_WEIGHTS } } }));
  };

  const current = state.players[state.currentIndex];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-amber-50 to-rose-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Dice6 className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Pass the Pigs</h1>
            <Badge variant="outline">Web Edition</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => resetGame(false)}>
              <RefreshCcw className="mr-2 h-4 w-4" /> Reset Scores
            </Button>
            <Button variant="ghost" size="sm" onClick={() => resetGame(true)}>
              New Match
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Left: Players & Settings */}
          <div className="lg:col-span-1 space-y-3 sm:space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Players
                  <Button variant="outline" size="icon" onClick={addPlayer}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.players.map((p, idx) => (
                  <div key={p.id} className={`flex items-center gap-2 p-2 rounded-xl ${idx === state.currentIndex ? "bg-white shadow" : ""}`}>
                    <div className="text-sm w-16 opacity-60">P{idx + 1}</div>
                    <Input
                      className="flex-1"
                      value={p.name}
                      onChange={(e) => setState((s) => ({
                        ...s,
                        players: s.players.map((pp) => (pp.id === p.id ? { ...pp, name: e.target.value } : pp)),
                      }))}
                    />
                    <div className="font-bold tabular-nums w-16 text-right">{p.score}</div>
                    {state.players.length > 2 && (
                      <Button variant="ghost" size="icon" onClick={() => removePlayer(p.id)}>
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
                <Separator />
                <div className="flex items-center gap-3">
                  <Label className="min-w-28">Target</Label>
                  <Input
                    type="number"
                    value={state.target}
                    onChange={(e) => setState((s) => ({ ...s, target: Math.max(10, Number(e.target.value || 0)) }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Confetti on win</Label>
                  <Switch
                    checked={state.settings.confettiOnWin}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, confettiOnWin: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Confetti on special rolls</Label>
                  <Switch
                    checked={state.settings.confettiOnSpecialRolls}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, confettiOnSpecialRolls: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show roll hints</Label>
                  <Switch
                    checked={state.settings.showRollHints}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, showRollHints: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Sound effects</Label>
                  <Switch
                    checked={state.settings.soundEffects}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, soundEffects: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show pose badges</Label>
                  <Switch
                    checked={state.settings.showPoseBadges}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, showPoseBadges: v } }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Fast roll mode</Label>
                  <Switch
                    checked={state.settings.fastRollMode}
                    onCheckedChange={(v) => setState((s) => ({ ...s, settings: { ...s.settings, fastRollMode: v } }))}
                  />
                </div>
                <Separator />
                <div>
                  <div className="font-semibold mb-2">Outcome Weights</div>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(state.settings.weights) as PigPose[]).map((pose) => (
                      <div key={pose} className="flex items-center gap-2">
                        <Label className="w-28 text-sm">{pose}</Label>
                        <Input
                          type="number"
                          value={state.settings.weights[pose]}
                          onChange={(e) => updateWeight(pose, Number(e.target.value || 0))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-muted-foreground">Higher number → more likely. Values are normalized automatically.</p>
                    <Button variant="outline" size="sm" onClick={resetWeightsToDefault}>
                      Reset to Default
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {!state.started && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-xl">Quick Rules (Simplified Classic)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <ul className="list-disc pl-5 space-y-1">
                    <li>On your turn, roll two pigs as many times as you like to build <strong>Turn Points</strong>.</li>
                    <li><strong>Hold</strong> to bank Turn Points into your total, then the next player goes.</li>
                    <li><strong>Pig Out</strong>: opposite sides (Left + Right) → 0 for the turn and you must click "Pass the Pigs" to end your turn.</li>
                    <li><strong>Sider</strong>: same sides (Left + Left or Right + Right) → +1 point.</li>
                    <li><strong>Single + Sider</strong>: one special + one sider → score the special's value.</li>
                    <li><strong>Two specials</strong>: add values. If they match, score <em>double the sum</em>.</li>
                  </ul>
                  <Separator className="my-2" />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="space-y-1">
                      <div className="font-semibold">Single Pose Values</div>
                      <div>Razorback = 5</div>
                      <div>Trotter = 5</div>
                      <div>Snouter = 10</div>
                      <div>Leaning Jowler = 15</div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">Other</div>
                      <div>Sider (same sides) = 1</div>
                      <div>Pig Out (opposite sides) = 0 and pass pigs</div>
                      <div>Double (e.g., Double Snouter) = (value+value) × 2</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">This build uses arcade-like probabilities (tweak in Settings). Not affiliated with the official game.</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Middle: Board */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Dice6 className="h-5 w-5" /> {state.started ? `${current?.name}'s Turn` : "Game Setup"}
                  {state.finalRound && (
                    <Badge className="ml-2" variant="destructive">Final Round</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!state.started ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <p className="mb-4 text-sm text-muted-foreground">Add players, pick a target, and start rolling those pigs! You can tweak the RNG weights in Settings for a tougher or easier game.</p>
                      <Button className="mt-2" onClick={startGame}>Start Game</Button>
                    </div>
                    <div>
                      <Card className="mt-0">
                        <CardHeader>
                          <CardTitle className="text-base">Final Round rule</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          When a player holds at or above the target, every other player gets exactly one more turn to beat the top score. Then the highest score wins.
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 sm:space-y-6">
                    {/* Arena */}
                    <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-inner border relative overflow-hidden">
                       <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.04), transparent 45%), radial-gradient(circle at 80% 50%, rgba(0,0,0,0.03), transparent 35%)" }} />
                       
                       {/* Particle effects */}
                       {particles.map(particle => (
                         <motion.div
                           key={particle.id}
                           className="absolute w-2 h-2 rounded-full pointer-events-none"
                           style={{
                             left: particle.x,
                             top: particle.y,
                             backgroundColor: particle.color,
                             opacity: particle.life
                           }}
                           initial={{ scale: 0 }}
                           animate={{ scale: particle.life }}
                           transition={{ duration: 0.1 }}
                         />
                       ))}
                       
                                               {/* Roll Result Display - Always takes same space */}
                        <div className="text-center mb-4 h-20 flex items-center justify-center">
                          {state.history.length > 0 && !rolling ? (
                            <div>
                              <div className="text-lg font-semibold text-gray-800">
                                {state.history[state.history.length - 1]?.event}
                              </div>
                              {state.history[state.history.length - 1]?.points > 0 && (
                                <div className="text-2xl font-bold text-green-600 mt-1">
                                  +{state.history[state.history.length - 1]?.points} points
                                </div>
                              )}
                              {state.history[state.history.length - 1]?.points === 0 && (
                                <div className="text-lg font-medium text-red-600 mt-1">
                                  No points this roll
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-gray-400 text-sm">
                              {rolling ? "Rolling..." : "Roll to see results"}
                            </div>
                          )}
                        </div>
                       
                                                <div className="flex items-center justify-center gap-8 h-44">
                          <PigEmoji 
                            key={`pig-0`}
                            pose={state.history[state.history.length - 1]?.pigs[0]?.pose ?? "Sider-Left"} 
                            i={0} 
                            rolling={rolling} 
                            anticipating={anticipating} 
                            showBadge={state.settings.showPoseBadges} 
                            fastRollMode={state.settings.fastRollMode}
                          />
                          <PigEmoji 
                            key={`pig-1`}
                            pose={state.history[state.history.length - 1]?.pigs[1]?.pose ?? "Sider-Right"} 
                            i={1} 
                            rolling={rolling} 
                            anticipating={anticipating} 
                            showBadge={state.settings.showPoseBadges} 
                            fastRollMode={state.settings.fastRollMode}
                          />
                         </div>
                      
                      {/* Pose Legend */}
                      {state.settings.showPoseBadges && (
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-gray-500 rounded-full flex items-center justify-center text-white text-[8px]">◀</div>
                            <span className="break-words">Sider Left</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-gray-500 rounded-full flex items-center justify-center text-white text-[8px]">▶</div>
                            <span className="break-words">Sider Right</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">▼</div>
                            <span className="break-words">Razorback</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">▲</div>
                            <span className="break-words">Trotter</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center text-white text-[8px]">◆</div>
                            <span className="break-words">Snouter</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center text-white text-[8px]">★</div>
                            <span className="break-words">Leaning Jowler</span>
                          </div>
                        </div>
                      )}
                      <div className="mt-4 text-center">
                        <div className="text-sm text-muted-foreground">Turn Points</div>
                        <motion.div 
                          key={state.turnPoints}
                          initial={{ scale: 1.2, y: -10 }}
                          animate={{ scale: 1, y: 0 }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className="text-4xl font-extrabold tabular-nums"
                        >
                          {state.turnPoints}
                        </motion.div>
                      </div>
                      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                        {state.needsToPassPigs ? (
                          <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Button size="lg" onClick={passThePigs} disabled={rolling} className="px-8 bg-red-600 hover:bg-red-700">
                              Pass the Pigs
                            </Button>
                          </motion.div>
                        ) : (
                          <>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button 
                                size="lg" 
                                onClick={roll} 
                                disabled={rolling || anticipating} 
                                className={`px-8 ${anticipating ? 'bg-yellow-500 hover:bg-yellow-600' : ''}`}
                              >
                                {anticipating ? "..." : rolling ? "Rolling..." : "Roll"}
                              </Button>
                            </motion.div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button size="lg" variant="secondary" onClick={hold} disabled={rolling || state.turnPoints === 0}>Hold</Button>
                            </motion.div>
                          </>
                        )}
                      </div>
                      {state.settings.showRollHints && (
                        <div className="mt-3 text-center text-xs text-muted-foreground px-2">
                          {state.needsToPassPigs 
                            ? "You got Pig Out! Click 'Pass the Pigs' to end your turn."
                            : anticipating
                            ? "Get ready..."
                            : rolling
                            ? "The pigs are tumbling!"
                            : "Rolling risks a Pig Out (opposite sides) that requires you to pass the pigs."
                          }
                        </div>
                      )}
                    </div>

                    {/* History */}
                    <div className="bg-white rounded-2xl p-4 shadow border">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">This Turn</div>
                        <div className="text-sm text-muted-foreground">{state.history.length} roll{state.history.length === 1 ? "" : "s"}</div>
                      </div>
                      <Separator className="my-3" />
                      <div className="max-h-64 overflow-auto space-y-3 pr-1">
                        {state.history.length === 0 ? (
                          <div className="text-sm text-muted-foreground">No rolls yet. Click Roll to start.</div>
                        ) : (
                          state.history
                            .slice()
                            .reverse()
                            .map((r, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-amber-50/60 p-2 rounded-xl">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <ScoreBadge pose={r.pigs[0].pose} />
                                  <span className="opacity-50">+</span>
                                  <ScoreBadge pose={r.pigs[1].pose} />
                                  <span className="text-xs text-muted-foreground ml-2 break-words leading-tight">{r.event}</span>
                                </div>
                                <div className="font-bold tabular-nums ml-2 flex-shrink-0">{r.points}</div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              {state.started && (
                <CardFooter className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {state.finalRound
                      ? "Final Round: each remaining player gets one last turn to beat the top score."
                      : `First to ${state.target} triggers the Final Round.`}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <ChevronLeft className="h-4 w-4" />
                    <span>{state.players[(state.currentIndex - 1 + state.players.length) % state.players.length]?.name}</span>
                    <span className="opacity-50">•</span>
                    <span className="font-semibold">{current?.name}</span>
                    <span className="opacity-50">•</span>
                    <span>{state.players[(state.currentIndex + 1) % state.players.length]?.name}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </CardFooter>
              )}
            </Card>

            {/* Scoreboard */}
            <Card>
              <CardHeader>
                <CardTitle>Scoreboard</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {state.players.map((p, i) => (
                    <div key={p.id} className={`rounded-2xl border p-4 bg-white ${i === state.currentIndex ? "ring-2 ring-rose-300" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold truncate mr-2">{p.name}</div>
                        {p.score >= state.target && !state.finalRound && (
                          <Badge className="gap-1"><Trophy className="h-3 w-3" /> Final Round Trigger</Badge>
                        )}
                      </div>
                      <div className="text-3xl font-extrabold tabular-nums mt-1">{p.score}</div>
                      {i === state.currentIndex && (
                        <div className="text-xs text-muted-foreground mt-1">Currently playing</div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {winner && (
              <Card className="border-amber-300 bg-amber-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> {winner.name} wins!</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">Final Round complete. Great game!</p>
                </CardContent>
                <CardFooter className="flex gap-3">
                  <Button onClick={() => resetGame(false)}>Reset Scores</Button>
                  <Button variant="secondary" onClick={() => resetGame(true)}>New Match</Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>

        {/* Score History - Full width at bottom */}
        <div className="mt-6">
          <ScoreHistory scoreHistory={state.scoreHistory} players={state.players} />
        </div>

        <footer className="text-center text-xs text-muted-foreground mt-6">
          Built with ❤️ in React + Tailwind. Not affiliated with the official Pass the Pigs®.
        </footer>
      </div>
    </div>
  );
}
