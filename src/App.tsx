import React, { useEffect, useState } from "react";
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

type GameState = {
  started: boolean;
  target: number;
  players: Player[];
  currentIndex: number;
  turnPoints: number;
  history: Roll[]; // current-turn history
  settings: {
    weights: Record<PigPose, number>;
    confettiOnWin: boolean;
    confettiOnSpecialRolls: boolean;
    showRollHints: boolean;
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
  
  // Check for double special poses
  if (pose1 === pose2 && (pose1 === "Razorback" || pose1 === "Trotter" || pose1 === "Snouter")) {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    return;
  }
  
  // Check for any Leaning Jowler
  if (pose1 === "Leaning Jowler" || pose2 === "Leaning Jowler") {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#FFD700', '#FFA500', '#FF6347', '#FF69B4']
    });
    return;
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

// Persisted state hook
function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
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

const PigEmoji: React.FC<{ pose: PigPose; i: number; rolling?: boolean }> = ({ pose, i, rolling }) => {
  const variants: Record<PigPose, { rotate: number; y: number; x: number; scale?: number }> = {
    "Sider-Left": { rotate: -90, y: 8, x: -10 },
    "Sider-Right": { rotate: 90, y: 8, x: 10 },
    Razorback: { rotate: 180, y: -8, x: 0 }, // Pig on its back
    Trotter: { rotate: 0, y: -20, x: 0, scale: 1.05 }, // Pig on front legs
    Snouter: { rotate: -45, y: -6, x: 6 }, // Pig on snout
    "Leaning Jowler": { rotate: 45, y: -2, x: 12 }, // Pig leaning on ear
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

  const v = variants[pose];
  const colors = poseColors[pose];
  const indicator = poseIndicators[pose];

  return (
    <motion.div
      className="relative text-6xl select-none"
      initial={{ y: -60, rotate: (i ? -1 : 1) * 45, opacity: 0 }}
      animate={rolling ? { y: [0, -24, 0], rotate: [0, 20, -15, 0], opacity: 1 } : { ...v, opacity: 1 }}
      transition={{ duration: rolling ? 0.6 : 0.35, ease: "easeOut" }}
    >
      {/* Pose indicator badge - only show when not rolling, always at top */}
      {!rolling && (
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
      
      {/* Main pig emoji */}
      <div className="relative">
        🐖
      </div>
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
    settings: {
      weights: { ...DEFAULT_WEIGHTS },
      confettiOnWin: true,
      confettiOnSpecialRolls: true,
      showRollHints: true,
    },
    finalRound: false,
    finalLeaderIndex: null,
    finalLeaderScore: 0,
    finalTurns: null,
    needsToPassPigs: false,
  };

  const [state, setState] = useLocalState<GameState>(STORAGE_KEY, defaultState);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    runInternalTests();
  }, []);

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
    }));
  };

  const roll = async () => {
    if (rolling || winner) return;
    setRolling(true);
    await new Promise((r) => setTimeout(r, 450));
    const a = randWeighted(state.settings.weights);
    const b = randWeighted(state.settings.weights);
    const { points, event } = scorePair(a, b);

    // Trigger confetti for special combinations
    triggerConfetti(a, b, state.settings.confettiOnSpecialRolls);

    setState((s) => {
      const newHistory: Roll[] = [
        ...s.history,
        { pigs: [{ pose: a }, { pose: b }] as [DiePig, DiePig], points, event },
      ];
      const pigOut = event.startsWith("Pig Out");
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
      const nextIndex = (s.currentIndex + 1) % s.players.length;
      let finalTurns = s.finalTurns ? { ...s.finalTurns } : null;
      if (s.finalRound && finalTurns) {
        finalTurns[curId] = true; // used their last chance
      }
      return {
        ...s,
        history: [],
        turnPoints: 0,
        currentIndex: nextIndex,
        finalTurns,
        needsToPassPigs: false,
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Players & Settings */}
          <div className="lg:col-span-1 space-y-4">
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
          <div className="lg:col-span-2 space-y-4">
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
                  <div className="space-y-6">
                                         {/* Arena */}
                     <div className="bg-white rounded-2xl p-6 shadow-inner border relative overflow-hidden">
                       <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(0,0,0,0.04), transparent 45%), radial-gradient(circle at 80% 50%, rgba(0,0,0,0.03), transparent 35%)" }} />
                       
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
                         <PigEmoji pose={state.history[state.history.length - 1]?.pigs[0]?.pose ?? "Sider-Left"} i={0} rolling={rolling} />
                         <PigEmoji pose={state.history[state.history.length - 1]?.pigs[1]?.pose ?? "Sider-Right"} i={1} rolling={rolling} />
                       </div>
                      
                      {/* Pose Legend */}
                      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-gray-500 rounded-full flex items-center justify-center text-white text-[8px]">◀</div>
                          <span>Sider Left</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-gray-500 rounded-full flex items-center justify-center text-white text-[8px]">▶</div>
                          <span>Sider Right</span>
                        </div>
                                                 <div className="flex items-center gap-1">
                           <div className="w-3 h-3 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px]">▼</div>
                           <span>Razorback</span>
                         </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px]">▲</div>
                          <span>Trotter</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-purple-500 rounded-full flex items-center justify-center text-white text-[8px]">◆</div>
                          <span>Snouter</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-orange-500 rounded-full flex items-center justify-center text-white text-[8px]">★</div>
                          <span>Leaning Jowler</span>
                        </div>
                      </div>
                      <div className="mt-4 text-center">
                        <div className="text-sm text-muted-foreground">Turn Points</div>
                        <div className="text-4xl font-extrabold tabular-nums">{state.turnPoints}</div>
                      </div>
                      <div className="mt-4 flex items-center justify-center gap-3">
                        {state.needsToPassPigs ? (
                          <Button size="lg" onClick={passThePigs} disabled={rolling} className="px-8 bg-red-600 hover:bg-red-700">
                            Pass the Pigs
                          </Button>
                        ) : (
                          <>
                            <Button size="lg" onClick={roll} disabled={rolling} className="px-8">Roll</Button>
                            <Button size="lg" variant="secondary" onClick={hold} disabled={rolling || state.turnPoints === 0}>Hold</Button>
                          </>
                        )}
                      </div>
                      {state.settings.showRollHints && (
                        <div className="mt-3 text-center text-xs text-muted-foreground">
                          {state.needsToPassPigs 
                            ? "You got Pig Out! Click 'Pass the Pigs' to end your turn."
                            : "Rolling risks a Pig Out (opposite sides) that requires you to pass the pigs."
                          }
                        </div>
                      )}
                    </div>

                    {/* History */}
                    <div className="bg-white rounded-2xl p-4 shadow border min-w-0">
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
                              <div key={idx} className="flex items-center justify-between bg-amber-50/60 p-2 rounded-xl min-w-0">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <ScoreBadge pose={r.pigs[0].pose} />
                                  <span className="opacity-50">+</span>
                                  <ScoreBadge pose={r.pigs[1].pose} />
                                  <span className="text-xs text-muted-foreground ml-2 truncate">{r.event}</span>
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

        <footer className="text-center text-xs text-muted-foreground mt-6">
          Built with ❤️ in React + Tailwind. Not affiliated with the official Pass the Pigs®.
        </footer>
      </div>
    </div>
  );
}
