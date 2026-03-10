import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/**
 * Snake & Ladders notes:
 * - Board squares are 1..100.
 * - Movement: roll 1..6, move forward if <= 100 (classic rule: must land exactly).
 * - After moving, apply at most one snake/ladder jump (destination square).
 * - First to reach 100 wins.
 */

const PLAYER_COLORS = ["#3b82f6", "#06b6d4", "#f59e0b", "#a855f7"];

const DEFAULT_PRESETS = [
  {
    id: "classic",
    name: "Classic",
    description: "A balanced set of snakes and ladders (good for casual play).",
    snakes: [
      [16, 6],
      [47, 26],
      [49, 11],
      [56, 53],
      [62, 19],
      [64, 60],
      [87, 24],
      [93, 73],
      [95, 75],
      [98, 78],
    ],
    ladders: [
      [1, 38],
      [4, 14],
      [9, 31],
      [21, 42],
      [28, 84],
      [36, 44],
      [51, 67],
      [71, 91],
      [80, 100],
    ],
  },
  {
    id: "quick",
    name: "Quick",
    description: "Shorter games: more ladders, fewer snakes.",
    snakes: [
      [34, 12],
      [62, 18],
      [88, 54],
      [97, 76],
    ],
    ladders: [
      [3, 22],
      [11, 44],
      [20, 59],
      [27, 83],
      [50, 70],
      [66, 92],
      [79, 99],
    ],
  },
];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

function parsePairsText(text) {
  // Format: "start:end, start:end" or one per line.
  // We also accept "start->end" as friendly syntax.
  const cleaned = (text || "")
    .replaceAll("->", ":")
    .replaceAll("—", ":")
    .replaceAll("–", ":");
  const tokens = cleaned
    .split(/[\n,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const pairs = [];
  for (const token of tokens) {
    const m = token.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!m) {
      return { ok: false, error: `Invalid pair "${token}". Use "start:end".` };
    }
    const a = Number(m[1]);
    const b = Number(m[2]);
    pairs.push([a, b]);
  }
  return { ok: true, pairs };
}

function buildTransitions(snakesPairs, laddersPairs) {
  const transitions = new Map();
  for (const [a, b] of snakesPairs) transitions.set(a, b);
  for (const [a, b] of laddersPairs) transitions.set(a, b);
  return transitions;
}

function validateConfig(snakesPairs, laddersPairs) {
  const allStarts = new Set();
  const allEnds = new Set();

  const validatePair = (pair, type) => {
    const [start, end] = pair;
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return `${type} has a non-integer value (${start}:${end}).`;
    }
    if (start < 1 || start > 100 || end < 1 || end > 100) {
      return `${type} contains out-of-range squares (${start}:${end}). Use 1–100.`;
    }
    if (start === end) {
      return `${type} start cannot equal end (${start}:${end}).`;
    }
    if (type === "Snake" && end > start) {
      return `Snake must go down (start > end). Found ${start}:${end}.`;
    }
    if (type === "Ladder" && end < start) {
      return `Ladder must go up (end > start). Found ${start}:${end}.`;
    }
    if (start === 100) return `${type} cannot start at 100.`;
    if (end === 1) return `${type} cannot end at 1.`;
    if (allStarts.has(start)) return `Duplicate start square ${start}.`;
    if (allEnds.has(end)) return `Duplicate end square ${end}.`;
    if (allEnds.has(start)) return `Square ${start} is an end of another transition; cannot also be a start.`;
    if (allStarts.has(end)) return `Square ${end} is a start of another transition; cannot also be an end.`;

    allStarts.add(start);
    allEnds.add(end);
    return null;
  };

  for (const p of snakesPairs) {
    const err = validatePair(p, "Snake");
    if (err) return { ok: false, error: err };
  }
  for (const p of laddersPairs) {
    const err = validatePair(p, "Ladder");
    if (err) return { ok: false, error: err };
  }

  // Extra guard: starts and ends must not overlap across snakes/ladders
  const starts = new Set([...snakesPairs.map((p) => p[0]), ...laddersPairs.map((p) => p[0])]);
  const ends = new Set([...snakesPairs.map((p) => p[1]), ...laddersPairs.map((p) => p[1])]);
  for (const s of starts) {
    if (ends.has(s)) {
      return { ok: false, error: `Square ${s} cannot be both a start and an end.` };
    }
  }

  return { ok: true };
}

function getSquareRowCol(square) {
  // row 0 is top (squares 100..91), row 9 is bottom (1..10).
  const indexFromBottom = Math.floor((square - 1) / 10); // 0..9
  const rowFromTop = 9 - indexFromBottom;
  const posInRow = (square - 1) % 10; // 0..9 from left-to-right in natural counting
  const isReversed = indexFromBottom % 2 === 1; // row 2 from bottom is reversed, etc.
  const col = isReversed ? 9 - posInRow : posInRow;
  return { row: rowFromTop, col };
}

function computeBoardSquaresForRendering() {
  // Render as a 10x10 grid, row 0..9 top->bottom, col 0..9 left->right.
  const grid = [];
  for (let r = 0; r < 10; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const indexFromTopLeft = r * 10 + c; // 0..99
      const rowFromBottom = 9 - r; // 9..0
      const base = rowFromBottom * 10;
      const isReversed = rowFromBottom % 2 === 1;
      const offset = isReversed ? 9 - c : c;
      const square = base + offset + 1;
      grid.push({ r, c, square });
    }
  }
  return grid;
}

function formatPairs(pairs) {
  return (pairs || []).map((p) => `${p[0]}:${p[1]}`).join(", ");
}

function initialPlayersFromCount(count) {
  const safe = clamp(Number(count) || 2, 2, 4);
  return range(safe).map((i) => ({
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    color: PLAYER_COLORS[i],
    position: 0, // 0 means "off the board" / start
  }));
}

function createLogEntry(type, message) {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    ts: new Date().toISOString(),
    type,
    message,
  };
}

// PUBLIC_INTERFACE
function App() {
  const [theme, setTheme] = useState("light");

  // Setup state
  const [screen, setScreen] = useState("setup"); // setup | game
  const [playerCount, setPlayerCount] = useState(2);
  const [playersDraft, setPlayersDraft] = useState(() => initialPlayersFromCount(2));

  const [presetId, setPresetId] = useState(DEFAULT_PRESETS[0].id);
  const [customMode, setCustomMode] = useState(false);
  const [snakesText, setSnakesText] = useState(formatPairs(DEFAULT_PRESETS[0].snakes));
  const [laddersText, setLaddersText] = useState(formatPairs(DEFAULT_PRESETS[0].ladders));
  const [configError, setConfigError] = useState("");

  // Game state
  const [gameConfig, setGameConfig] = useState(() => ({
    snakes: DEFAULT_PRESETS[0].snakes,
    ladders: DEFAULT_PRESETS[0].ladders,
    transitions: buildTransitions(DEFAULT_PRESETS[0].snakes, DEFAULT_PRESETS[0].ladders),
  }));
  const [players, setPlayers] = useState(() => initialPlayersFromCount(2));
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dice, setDice] = useState(null); // 1..6
  const [rolling, setRolling] = useState(false);
  const [winnerId, setWinnerId] = useState(null);
  const [log, setLog] = useState(() => [createLogEntry("info", "Set up a game to begin.")]);
  const [rulesOpen, setRulesOpen] = useState(false);

  const boardSquares = useMemo(() => computeBoardSquaresForRendering(), []);
  const logEndRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    // Keep draft players list in sync with playerCount changes
    setPlayersDraft((prev) => {
      const next = initialPlayersFromCount(playerCount);
      // Preserve names already typed
      for (let i = 0; i < Math.min(prev.length, next.length); i += 1) {
        next[i].name = prev[i].name || next[i].name;
      }
      return next;
    });
  }, [playerCount]);

  useEffect(() => {
    // Scroll log to bottom
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [log.length]);

  useEffect(() => {
    // When preset changes and not in custom mode, load it into text/config
    const preset = DEFAULT_PRESETS.find((p) => p.id === presetId) || DEFAULT_PRESETS[0];
    if (!customMode) {
      setSnakesText(formatPairs(preset.snakes));
      setLaddersText(formatPairs(preset.ladders));
      setConfigError("");
    }
  }, [presetId, customMode]);

  const activePlayer = players[currentPlayerIndex];

  // PUBLIC_INTERFACE
  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  const pushLog = (entry) => {
    setLog((prev) => {
      const next = [...prev, entry];
      // cap log to keep UI snappy
      return next.length > 250 ? next.slice(next.length - 250) : next;
    });
  };

  const resetToSetup = () => {
    setScreen("setup");
    setWinnerId(null);
    setDice(null);
    setRolling(false);
    setCurrentPlayerIndex(0);
    setPlayers(initialPlayersFromCount(playerCount));
    pushLog(createLogEntry("info", "Returned to setup."));
  };

  const startNewGame = () => {
    setConfigError("");

    let snakesPairs = [];
    let laddersPairs = [];

    if (customMode) {
      const s = parsePairsText(snakesText);
      if (!s.ok) {
        setConfigError(`Snakes: ${s.error}`);
        return;
      }
      const l = parsePairsText(laddersText);
      if (!l.ok) {
        setConfigError(`Ladders: ${l.error}`);
        return;
      }
      snakesPairs = s.pairs;
      laddersPairs = l.pairs;
    } else {
      const preset = DEFAULT_PRESETS.find((p) => p.id === presetId) || DEFAULT_PRESETS[0];
      snakesPairs = preset.snakes;
      laddersPairs = preset.ladders;
    }

    const valid = validateConfig(snakesPairs, laddersPairs);
    if (!valid.ok) {
      setConfigError(valid.error);
      return;
    }

    const cleanedPlayers = playersDraft.map((p, idx) => ({
      id: p.id,
      name: (p.name || `Player ${idx + 1}`).trim().slice(0, 24),
      color: p.color,
      position: 0,
    }));

    const transitions = buildTransitions(snakesPairs, laddersPairs);
    setGameConfig({ snakes: snakesPairs, ladders: laddersPairs, transitions });
    setPlayers(cleanedPlayers);
    setCurrentPlayerIndex(0);
    setDice(null);
    setWinnerId(null);
    setRolling(false);
    setScreen("game");
    setLog([createLogEntry("info", `Game started with ${cleanedPlayers.length} players.`)]);
  };

  const applyTransitionIfAny = (square) => {
    const dest = gameConfig.transitions.get(square);
    if (!dest) return { square, jumped: false, dest: null };
    return { square: dest, jumped: true, dest };
  };

  const nextTurn = () => {
    setCurrentPlayerIndex((i) => (i + 1) % players.length);
  };

  const rollDice = async () => {
    if (screen !== "game") return;
    if (winnerId) return;
    if (rolling) return;

    setRolling(true);
    setDice(null);

    // Small animation-like delay
    await new Promise((r) => setTimeout(r, 450));

    const roll = 1 + Math.floor(Math.random() * 6);
    setDice(roll);
    pushLog(createLogEntry("roll", `${activePlayer.name} rolled a ${roll}.`));

    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p }));
      const p = next[currentPlayerIndex];

      const from = p.position;
      const tentative = from + roll;

      if (tentative > 100) {
        pushLog(
          createLogEntry(
            "info",
            `${p.name} needs an exact roll to reach 100 (stays on ${from || "start"}).`
          )
        );
        return next;
      }

      p.position = tentative;
      if (tentative === 100) {
        // win immediately on exact landing 100
        return next;
      }

      const transitioned = applyTransitionIfAny(tentative);
      if (transitioned.jumped) {
        const isSnake = transitioned.square < tentative;
        pushLog(
          createLogEntry(
            isSnake ? "snake" : "ladder",
            `${p.name} hit a ${isSnake ? "snake" : "ladder"}: ${tentative} → ${transitioned.square}.`
          )
        );
        p.position = transitioned.square;
      }

      return next;
    });

    setRolling(false);
  };

  useEffect(() => {
    if (screen !== "game") return;
    if (winnerId) return;

    const current = players[currentPlayerIndex];
    if (!current) return;

    if (current.position === 100) {
      setWinnerId(current.id);
      pushLog(createLogEntry("win", `${current.name} wins!`));
    }
  }, [players, currentPlayerIndex, screen, winnerId]);

  useEffect(() => {
    // When dice finishes and no winner, advance turn. (But only after a roll is recorded.)
    if (screen !== "game") return;
    if (rolling) return;
    if (!dice) return;
    if (winnerId) return;

    // If reached 100, winner effect will handle it.
    const current = players[currentPlayerIndex];
    if (current?.position === 100) return;

    const t = setTimeout(() => nextTurn(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice, rolling, screen, winnerId]);

  const restartSameConfig = () => {
    if (screen !== "game") return;
    setPlayers((prev) => prev.map((p) => ({ ...p, position: 0 })));
    setCurrentPlayerIndex(0);
    setDice(null);
    setWinnerId(null);
    setRolling(false);
    setLog([createLogEntry("info", "Game restarted (same players and config).")]);
  };

  const onEditPlayerName = (idx, name) => {
    setPlayersDraft((prev) => prev.map((p, i) => (i === idx ? { ...p, name } : p)));
  };

  const preset = DEFAULT_PRESETS.find((p) => p.id === presetId) || DEFAULT_PRESETS[0];

  const squareMeta = useMemo(() => {
    const starts = new Map();
    const ends = new Map();
    for (const [a, b] of gameConfig.snakes) {
      starts.set(a, { type: "snake", to: b });
      ends.set(b, { type: "snake_end", from: a });
    }
    for (const [a, b] of gameConfig.ladders) {
      starts.set(a, { type: "ladder", to: b });
      ends.set(b, { type: "ladder_end", from: a });
    }
    return { starts, ends };
  }, [gameConfig.ladders, gameConfig.snakes]);

  const playersOnSquare = useMemo(() => {
    const map = new Map();
    for (const p of players) {
      const pos = p.position || 0;
      if (!map.has(pos)) map.set(pos, []);
      map.get(pos).push(p);
    }
    return map;
  }, [players]);

  const renderSetup = () => (
    <div className="sl-page">
      <div className="sl-topbar">
        <div className="sl-brand">
          <div className="sl-logo">SL</div>
          <div>
            <div className="sl-title">Snake & Ladders</div>
            <div className="sl-subtitle">A classic 1–100 board game for 2–4 players.</div>
          </div>
        </div>

        <div className="sl-topbar-actions">
          <button className="sl-btn sl-btn-ghost" onClick={() => setRulesOpen(true)}>
            Rules
          </button>
          <button
            className="sl-btn sl-btn-primary"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            title="Toggle theme"
          >
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>
      </div>

      <div className="sl-layout sl-layout-setup">
        <div className="sl-card sl-setup-card">
          <div className="sl-card-header">
            <h2>Game setup</h2>
            <p>Choose players and board configuration.</p>
          </div>

          <div className="sl-form">
            <div className="sl-form-row">
              <label className="sl-label" htmlFor="playerCount">
                Players
              </label>
              <div className="sl-inline">
                <input
                  id="playerCount"
                  className="sl-input"
                  type="number"
                  min={2}
                  max={4}
                  value={playerCount}
                  onChange={(e) => setPlayerCount(clamp(Number(e.target.value || 2), 2, 4))}
                />
                <div className="sl-hint">2 to 4 players.</div>
              </div>
            </div>

            <div className="sl-form-row">
              <div className="sl-label">Names</div>
              <div className="sl-player-grid">
                {playersDraft.map((p, idx) => (
                  <div className="sl-player-pill" key={p.id}>
                    <span className="sl-player-dot" style={{ background: p.color }} aria-hidden />
                    <input
                      className="sl-input sl-input-compact"
                      value={p.name}
                      onChange={(e) => onEditPlayerName(idx, e.target.value)}
                      placeholder={`Player ${idx + 1}`}
                      aria-label={`Player ${idx + 1} name`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="sl-divider" />

            <div className="sl-form-row">
              <div className="sl-label">Snakes & ladders</div>
              <div className="sl-stack">
                <div className="sl-toggle-row">
                  <button
                    className={`sl-seg ${!customMode ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setCustomMode(false)}
                  >
                    Preset
                  </button>
                  <button
                    className={`sl-seg ${customMode ? "is-active" : ""}`}
                    type="button"
                    onClick={() => setCustomMode(true)}
                  >
                    Custom
                  </button>
                </div>

                {!customMode ? (
                  <div className="sl-preset-box">
                    <label className="sl-label" htmlFor="presetSelect">
                      Preset
                    </label>
                    <select
                      id="presetSelect"
                      className="sl-select"
                      value={presetId}
                      onChange={(e) => setPresetId(e.target.value)}
                    >
                      {DEFAULT_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <div className="sl-hint">{preset.description}</div>

                    <div className="sl-mini-grid">
                      <div className="sl-mini-card">
                        <div className="sl-mini-title">Snakes</div>
                        <div className="sl-mini-body">{formatPairs(preset.snakes)}</div>
                      </div>
                      <div className="sl-mini-card">
                        <div className="sl-mini-title">Ladders</div>
                        <div className="sl-mini-body">{formatPairs(preset.ladders)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="sl-custom-box">
                    <div className="sl-hint">
                      Format: <span className="sl-mono">start:end</span> separated by commas or new lines. Snakes go
                      down, ladders go up. Example: <span className="sl-mono">16:6</span>
                    </div>

                    <div className="sl-two-col">
                      <div>
                        <label className="sl-label" htmlFor="snakesText">
                          Snakes
                        </label>
                        <textarea
                          id="snakesText"
                          className="sl-textarea"
                          value={snakesText}
                          onChange={(e) => setSnakesText(e.target.value)}
                          rows={5}
                        />
                      </div>
                      <div>
                        <label className="sl-label" htmlFor="laddersText">
                          Ladders
                        </label>
                        <textarea
                          id="laddersText"
                          className="sl-textarea"
                          value={laddersText}
                          onChange={(e) => setLaddersText(e.target.value)}
                          rows={5}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {configError ? <div className="sl-alert sl-alert-error">{configError}</div> : null}
              </div>
            </div>

            <div className="sl-actions">
              <button className="sl-btn sl-btn-primary sl-btn-large" onClick={startNewGame}>
                Start game
              </button>
              <button className="sl-btn sl-btn-ghost sl-btn-large" onClick={() => setRulesOpen(true)}>
                View rules
              </button>
            </div>
          </div>
        </div>

        <div className="sl-card sl-side-card">
          <div className="sl-card-header">
            <h2>Tips</h2>
            <p>Quick reminders while you set up.</p>
          </div>
          <ul className="sl-list">
            <li>Exact roll required to land on square 100.</li>
            <li>Landing on a snake/ladder start triggers an instant jump.</li>
            <li>Multiple players can share the same square.</li>
          </ul>
          <div className="sl-divider" />
          <div className="sl-muted">
            Want a faster game? Choose the <strong>Quick</strong> preset.
          </div>
        </div>
      </div>

      {rulesOpen ? <RulesModal onClose={() => setRulesOpen(false)} /> : null}
    </div>
  );

  const renderGame = () => {
    const winner = winnerId ? players.find((p) => p.id === winnerId) : null;

    return (
      <div className="sl-page">
        <div className="sl-topbar">
          <div className="sl-brand">
            <div className="sl-logo">SL</div>
            <div>
              <div className="sl-title">Snake & Ladders</div>
              <div className="sl-subtitle">Reach square 100 to win.</div>
            </div>
          </div>

          <div className="sl-topbar-actions">
            <button className="sl-btn sl-btn-ghost" onClick={() => setRulesOpen(true)}>
              Rules
            </button>
            <button className="sl-btn sl-btn-ghost" onClick={restartSameConfig}>
              Restart
            </button>
            <button className="sl-btn sl-btn-primary" onClick={resetToSetup}>
              New game
            </button>
          </div>
        </div>

        <div className="sl-layout">
          <div className="sl-board-wrap">
            <div className="sl-turnbar" role="status" aria-live="polite">
              {winner ? (
                <div className="sl-win">
                  <span className="sl-badge sl-badge-success">Winner</span>
                  <span className="sl-win-name" style={{ color: winner.color }}>
                    {winner.name}
                  </span>
                  <span className="sl-muted">— Congrats! You reached 100.</span>
                </div>
              ) : (
                <div className="sl-turn">
                  <span className="sl-badge">Turn</span>
                  <span className="sl-turn-name" style={{ color: activePlayer?.color }}>
                    {activePlayer?.name}
                  </span>
                  <span className="sl-muted">Roll the dice.</span>
                </div>
              )}

              <div className="sl-dice-box">
                <div className={`sl-dice ${rolling ? "is-rolling" : ""}`} aria-label="Dice result">
                  {dice || "—"}
                </div>
                <button
                  className="sl-btn sl-btn-primary"
                  onClick={rollDice}
                  disabled={rolling || !!winnerId}
                  aria-disabled={rolling || !!winnerId}
                >
                  {winnerId ? "Game over" : rolling ? "Rolling..." : "Roll dice"}
                </button>
              </div>
            </div>

            <div className="sl-board" role="grid" aria-label="Snake and Ladders board">
              {boardSquares.map(({ square }) => {
                const metaStart = squareMeta.starts.get(square);
                const metaEnd = squareMeta.ends.get(square);
                const tokens = playersOnSquare.get(square) || [];
                const { row, col } = getSquareRowCol(square);

                const classes = ["sl-cell"];
                if (metaStart?.type === "snake") classes.push("is-snake-start");
                if (metaStart?.type === "ladder") classes.push("is-ladder-start");
                if (metaEnd) classes.push("is-transition-end");
                if (square === 100) classes.push("is-goal");
                if (square === 1) classes.push("is-start");

                const hintParts = [];
                if (metaStart?.type === "snake") hintParts.push(`Snake to ${metaStart.to}`);
                if (metaStart?.type === "ladder") hintParts.push(`Ladder to ${metaStart.to}`);
                if (tokens.length) hintParts.push(`Players: ${tokens.map((t) => t.name).join(", ")}`);

                return (
                  <div
                    key={square}
                    className={classes.join(" ")}
                    role="gridcell"
                    aria-label={`Square ${square}${hintParts.length ? `. ${hintParts.join(". ")}` : ""}`}
                    data-row={row}
                    data-col={col}
                  >
                    <div className="sl-cell-top">
                      <div className="sl-cell-num">{square}</div>
                      {metaStart ? (
                        <div className={`sl-chip ${metaStart.type === "snake" ? "is-snake" : "is-ladder"}`}>
                          {metaStart.type === "snake" ? "S" : "L"}→{metaStart.to}
                        </div>
                      ) : null}
                      {!metaStart && metaEnd ? <div className="sl-chip is-end">End</div> : null}
                    </div>

                    <div className="sl-tokens" aria-hidden={tokens.length === 0}>
                      {tokens.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          className="sl-token"
                          style={{ background: p.color }}
                          title={`${p.name} @ ${square}`}
                        />
                      ))}
                      {tokens.length > 4 ? <span className="sl-token-more">+{tokens.length - 4}</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sl-legend">
              <div className="sl-legend-item">
                <span className="sl-legend-swatch is-snake" /> Snake start
              </div>
              <div className="sl-legend-item">
                <span className="sl-legend-swatch is-ladder" /> Ladder start
              </div>
              <div className="sl-legend-item">
                <span className="sl-legend-swatch is-goal" /> Goal
              </div>
            </div>
          </div>

          <aside className="sl-sidebar">
            <div className="sl-card">
              <div className="sl-card-header">
                <h2>Players</h2>
                <p>Positions update after each roll.</p>
              </div>

              <div className="sl-player-list" role="list">
                {players.map((p, idx) => (
                  <div className={`sl-player-row ${idx === currentPlayerIndex && !winnerId ? "is-active" : ""}`} key={p.id}>
                    <div className="sl-player-left">
                      <span className="sl-player-dot" style={{ background: p.color }} aria-hidden />
                      <div>
                        <div className="sl-player-name">{p.name}</div>
                        <div className="sl-player-meta">
                          Square: <span className="sl-mono">{p.position || 0}</span>
                        </div>
                      </div>
                    </div>
                    {idx === currentPlayerIndex && !winnerId ? <span className="sl-pill">Current</span> : null}
                    {winnerId === p.id ? <span className="sl-pill sl-pill-win">Winner</span> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="sl-card">
              <div className="sl-card-header">
                <h2>Game log</h2>
                <p>Latest events appear at the bottom.</p>
              </div>

              <div className="sl-log" aria-label="Game log">
                {log.map((e) => (
                  <div className={`sl-log-item type-${e.type}`} key={e.id}>
                    <span className="sl-log-dot" aria-hidden />
                    <div className="sl-log-text">{e.message}</div>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>

              <div className="sl-log-actions">
                <button className="sl-btn sl-btn-ghost" onClick={() => setLog([createLogEntry("info", "Log cleared.")])}>
                  Clear log
                </button>
              </div>
            </div>

            <div className="sl-card">
              <div className="sl-card-header">
                <h2>Board config</h2>
                <p>Current snakes and ladders.</p>
              </div>

              <div className="sl-mini-grid">
                <div className="sl-mini-card">
                  <div className="sl-mini-title">Snakes</div>
                  <div className="sl-mini-body">{formatPairs(gameConfig.snakes) || "—"}</div>
                </div>
                <div className="sl-mini-card">
                  <div className="sl-mini-title">Ladders</div>
                  <div className="sl-mini-body">{formatPairs(gameConfig.ladders) || "—"}</div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {rulesOpen ? <RulesModal onClose={() => setRulesOpen(false)} /> : null}
      </div>
    );
  };

  return <div className="App">{screen === "setup" ? renderSetup() : renderGame()}</div>;
}

// PUBLIC_INTERFACE
function RulesModal({ onClose }) {
  /** Modal used to show game rules and how configuration works. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sl-modal-backdrop" role="dialog" aria-modal="true" aria-label="Game rules">
      <div className="sl-modal">
        <div className="sl-modal-header">
          <div>
            <div className="sl-modal-title">Rules</div>
            <div className="sl-modal-subtitle">Everything you need to play.</div>
          </div>
          <button className="sl-btn sl-btn-ghost" onClick={onClose} aria-label="Close rules">
            Close
          </button>
        </div>

        <div className="sl-modal-body">
          <div className="sl-rules-grid">
            <div className="sl-rule-card">
              <h3>Objective</h3>
              <p>Be the first player to reach square <strong>100</strong>.</p>
            </div>
            <div className="sl-rule-card">
              <h3>Turns</h3>
              <p>Players take turns rolling a six-sided die (1–6).</p>
            </div>
            <div className="sl-rule-card">
              <h3>Exact finish</h3>
              <p>You must land exactly on 100. If your roll would go past, you stay put.</p>
            </div>
            <div className="sl-rule-card">
              <h3>Snakes & ladders</h3>
              <p>Landing on a start square triggers an instant jump to its end square.</p>
            </div>
          </div>

          <div className="sl-divider" />

          <h3>Custom configuration</h3>
          <p className="sl-muted">
            In <strong>Custom</strong> mode, enter pairs as <span className="sl-mono">start:end</span>.
            Snakes must go down (start &gt; end), ladders must go up (end &gt; start). Starts/ends cannot overlap.
          </p>

          <div className="sl-example">
            <div className="sl-example-title">Examples</div>
            <div className="sl-example-body">
              <div>
                <div className="sl-example-label">Snakes</div>
                <div className="sl-mono">16:6, 47:26, 98:78</div>
              </div>
              <div>
                <div className="sl-example-label">Ladders</div>
                <div className="sl-mono">4:14, 28:84, 71:91</div>
              </div>
            </div>
          </div>
        </div>

        <div className="sl-modal-footer">
          <button className="sl-btn sl-btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
