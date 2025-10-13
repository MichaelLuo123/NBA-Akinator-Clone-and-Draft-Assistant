"use client";
import React, { useState, useEffect } from "react";
import { fetchGameData } from "@/lib/actions";

// Define TypeScript interface for player data
interface Player {
  full_name: string;
  team: string;
  position: string;
  conference: string;
  height: number;
  weight: number;
  age: number;
  average_points: number;
  average_assists: number;
  average_rebounds: number;
  average_steals: number;
  average_blocks: number;
  awards_count: number;
}

const GuessYourLegend = () => {
  // States for the game
  const [gameState, setGameState] = useState<"intro" | "playing" | "result">(
    "intro"
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [conference, setConference] = useState<string | null>(null); // east, west
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [playersRemaining, setPlayersRemaining] = useState<number>(0);
  const [questionsAsked, setQuestionsAsked] = useState<number>(0);
  const [guessedPlayer, setGuessedPlayer] = useState<string>("");
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [nbaData, setNbaData] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [inFinalRound, setInFinalRound] = useState<boolean>(false);
  const [finalCandidates, setFinalCandidates] = useState<Player[]>([]);
  const [finalIndex, setFinalIndex] = useState<number>(0);
  const [asked, setAsked] = useState<{ question: string; answer: boolean }[]>([]);
  const [candidateIds, setCandidateIds] = useState<string[]>([]);
  const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  const [useBackend, setUseBackend] = useState<boolean>(false);

  // Probe backend health once on mount; disable backend if unreachable
  useEffect(() => {
    const ping = async () => {
      try {
        const r = await fetch(`${BACKEND_BASE}/health`, { cache: "no-store" });
        if (!r.ok) setUseBackend(false);
      } catch {
        setUseBackend(false);
      }
    };
    ping();
  }, []);

  // Helper function to convert cm to feet and inches
  const cmToInches = (cm: number): string => {
    const inches = cm / 2.54;
    const feet = Math.floor(inches / 12);
    const inchesRemainder = Math.round(inches % 12);
    return `${feet}'${inchesRemainder}"`;
  };

  // Helper function to clean position
  const cleanPosition = (pos: string): string => {
    pos = String(pos).toLowerCase();
    if (pos.includes("guard") && pos.includes("forward")) {
      return "G-F";
    }
    if (
      (pos.includes("forward") && pos.includes("center")) ||
      (pos.includes("center") && pos.includes("forward"))
    ) {
      return "F-C";
    }
    if (pos.includes("forward")) {
      return "F";
    }
    if (pos.includes("center")) {
      return "C";
    }
    if (pos.includes("guard")) {
      return "G";
    }
    return "Unknown";
  };

  // Add log message
  const addLog = (message: string): void => {
    setLogMessages((prev) => [...prev, message]);
  };

  // Load NBA player data
  useEffect(() => {
    const loadGameData = async () => {
      try {
        setIsLoading(true);
        const data = await fetchGameData();

        const playersArray = Object.values(data).filter(
          (player) => typeof player === "object" && player !== null
        );

        // Add conference property based on team
        const enrichedData = playersArray.map((player: Record<string, string>) => {
          // Define which teams are in which conference
          const eastTeams = [
            "Celtics",
            "Knicks",
            "Nets",
            "76ers",
            "Raptors",
            "Bucks",
            "Bulls",
            "Cavaliers",
            "Pistons",
            "Pacers",
            "Hawks",
            "Heat",
            "Hornets",
            "Magic",
            "Wizards",
          ];
          const westTeams = [
            "Lakers",
            "Clippers",
            "Warriors",
            "Kings",
            "Suns",
            "Mavericks",
            "Spurs",
            "Rockets",
            "Grizzlies",
            "Pelicans",
            "Thunder",
            "Trail Blazers",
            "Timberwolves",
            "Nuggets",
            "Jazz",
          ];

          let conference;
          if (eastTeams.includes(player.team)) {
            conference = "east";
          } else if (westTeams.includes(player.team)) {
            conference = "west";
          } else {
            // If team is empty or not recognized, default to a conference
            // For this example, let's put free agents in the east
            conference = "east";
          }

          // Fix position format for consistency
          let position = player.position as string;
          if (position === "Center-Forward") position = "F-C";
          else if (position === "Forward-Center") position = "F-C";
          else if (position === "Guard-Forward") position = "G-F";
          else if (position === "Forward") position = "F";
          else if (position === "Guard") position = "G";
          else if (position === "Center") position = "C";
          else position = "F"; // Default to Forward if unknown

          // Ensure all numeric fields are actually numbers
          return {
            ...player,
            conference,
            position,
            height: parseFloat(player.height || "0") || 0,
            weight: parseFloat(player.weight || "0") || 0,
            age: parseInt(player.age || "0") || 0,
            average_points: parseFloat(player.average_points || "0") || 0,
            average_assists: parseFloat(player.average_assists || "0") || 0,
            average_rebounds: parseFloat(player.average_rebounds || "0") || 0,
            average_steals: parseFloat(player.average_steals || "0") || 0,
            average_blocks: parseFloat(player.average_blocks || "0") || 0,
            awards_count: parseInt(player.awards_count || "0") || 0,
          } as unknown as Player;
        });

        setNbaData(enrichedData as Player[]);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to load game data:", error);
        setIsLoading(false);
      }
    };

    loadGameData();
  }, []);

  // Main game logic
  const askNextQuestion = (currentPlayers: Player[]): void => {
    if (currentPlayers.length <= 0) {
      addLog("No players match these criteria. Something went wrong.");
      setGameState("result");
      setGuessedPlayer("Error: No matching players");
      return;
    }

    setPlayersRemaining(currentPlayers.length);

    // If we're down to 5 or fewer players, enter final round: ask by name sequentially
    if (currentPlayers.length <= 5) {
      const valid = currentPlayers.filter(
        (p) => typeof p.full_name === "string" && p.full_name.trim().length > 0
      );
      if (valid.length === 0) {
        setGameState("result");
        setGuessedPlayer("Unable to determine – no valid candidate names");
      addLog("No valid candidate names to confirm.");
        return;
      }
      setInFinalRound(true);
      setFinalCandidates(valid);
      setFinalIndex(0);
      setCurrentQuestion(`Is your player ${valid[0].full_name}?`);
      return;
    }

    if (currentPlayers.length === 1) {
      // We've found the player
      setGameState("result");
      setGuessedPlayer(currentPlayers[0].full_name);
      addLog(`My guess is... **${currentPlayers[0].full_name}**!`);
      return;
    }

    // Find the best column for splitting the players
    let bestColumn: string | null = null;
    let bestThreshold: any = null;
    let bestBalance = Infinity;

    // Try team-based questions
    const teams = [...new Set(currentPlayers.map((p) => p.team))];
    if (teams.length > 1) {
      for (const team of teams) {
        const teamCount = currentPlayers.filter((p) => p.team === team).length;
        const nonTeamCount = currentPlayers.length - teamCount;
        const balance = Math.abs(teamCount - nonTeamCount);

        if (balance < bestBalance) {
          bestBalance = balance;
          bestColumn = "team";
          bestThreshold = team;
        }
      }
    }

    // Handle position questions
    const positionGroups = {
      pure_guard: currentPlayers.filter((p) => p.position === "G").length,
      pure_forward: currentPlayers.filter((p) => p.position === "F").length,
      pure_center: currentPlayers.filter((p) => p.position === "C").length,
      guard_forward: currentPlayers.filter((p) => p.position === "G-F").length,
      forward_center: currentPlayers.filter((p) => p.position === "F-C").length,
    };

    for (const [posType, posCount] of Object.entries(positionGroups)) {
      const nonPosCount = currentPlayers.length - posCount;
      const balance = Math.abs(posCount - nonPosCount);

      if (balance < bestBalance && posCount > 0) {
        bestBalance = balance;
        bestColumn = "position_specific";
        bestThreshold = posType;
      }
    }

    // Try awards
    const awardCount = currentPlayers.filter((p) => p.awards_count > 0).length;
    const noAwardCount = currentPlayers.length - awardCount;
    const awardBalance = Math.abs(awardCount - noAwardCount);

    if (awardBalance < bestBalance) {
      bestBalance = awardBalance;
      bestColumn = "awards";
      bestThreshold = null;
    }

    // Try numeric columns
    const numericCols = [
      "age",
      "height",
      "weight",
      "average_points",
      "average_assists",
      "average_rebounds",
      "average_steals",
      "average_blocks",
    ] as const;

    for (const col of numericCols) {
      const values = [...new Set(currentPlayers.map((p) => p[col]))]
        .filter((val) => val !== undefined && val !== null)
        .sort((a, b) => a - b);

      if (values.length > 1) {
        for (let i = 0; i < values.length - 1; i++) {
          const threshold = (values[i] + values[i + 1]) / 2;

          const leftCount = currentPlayers.filter(
            (p) => p[col] <= threshold
          ).length;
          const rightCount = currentPlayers.length - leftCount;
          const balance = Math.abs(leftCount - rightCount);

          if (balance < bestBalance) {
            bestBalance = balance;
            bestColumn = col;
            bestThreshold = threshold;
          }
        }
      }
    }

    // Construct the question based on the best dividing attribute
    if (bestColumn === "team") {
      setCurrentQuestion(`Is your player on the ${bestThreshold}?`);
    } else if (bestColumn === "position_specific") {
      if (bestThreshold === "pure_guard") {
        setCurrentQuestion(
          "Is your player strictly a Guard (G), not a Guard-Forward hybrid?"
        );
      } else if (bestThreshold === "pure_forward") {
        setCurrentQuestion(
          "Is your player strictly a Forward (F), not a hybrid position?"
        );
      } else if (bestThreshold === "pure_center") {
        setCurrentQuestion(
          "Is your player strictly a Center (C), not a Forward-Center hybrid?"
        );
      } else if (bestThreshold === "guard_forward") {
        setCurrentQuestion("Is your player a Guard-Forward (G-F) hybrid?");
      } else if (bestThreshold === "forward_center") {
        setCurrentQuestion("Is your player a Forward-Center (F-C) hybrid?");
      }
    } else if (bestColumn === "awards") {
      setCurrentQuestion("Has your player received any awards?");
    } else if (bestColumn === "age") {
      setCurrentQuestion(
        `Is your player older than ${Math.floor(bestThreshold)} years?`
      );
    } else if (bestColumn === "height") {
      setCurrentQuestion(
        `Is your player taller than ${cmToInches(bestThreshold)}?`
      );
    } else if (bestColumn === "weight") {
      setCurrentQuestion(
        `Is your player heavier than ${Math.floor(bestThreshold)} lbs?`
      );
    } else if (
      [
        "average_points",
        "average_assists",
        "average_rebounds",
        "average_steals",
        "average_blocks",
      ].includes(bestColumn || "")
    ) {
      const statName = bestColumn?.replace("average_", "");
      setCurrentQuestion(
        `Does your player average more than ${bestThreshold.toFixed(
          1
        )} ${statName}?`
      );
    } else {
      // Fallback question with a simple split
      const halfIndex = Math.floor(currentPlayers.length / 2);
      const firstHalf = currentPlayers.slice(0, halfIndex);
      const playerNames = firstHalf.map((p) => p.full_name).join(", ");
      setCurrentQuestion(`Is your player one of these: ${playerNames}?`);
    }
  };

  // Handle user's answer
  // Define a state variable to keep track of the current filtered players
  const [currentFilteredPlayers, setCurrentFilteredPlayers] = useState<
    Player[]
  >([]);

  // Update the selectConference function to initialize the filtered players
  const selectConference = async (conf: string): Promise<void> => {
    const c = conf.toLowerCase();
    setConference(c);
    setGameState("playing");
    const filteredPlayers = nbaData.filter((p) => p.conference === c);
    setCurrentFilteredPlayers(filteredPlayers);
    setPlayersRemaining(filteredPlayers.length);
    setQuestionsAsked(0);
    setLogMessages([]);
    setAsked([]);
    setCandidateIds(filteredPlayers.map((p: any) => String((p as any).id ?? p.full_name)));
    addLog(`Think of an active NBA player from the ${conf}ern Conference...`);
    if (useBackend) {
      try {
        const res = await fetch(`${BACKEND_BASE}/next-question`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asked: [], candidate_ids: filteredPlayers.map((p: any) => String((p as any).id ?? p.full_name)) }),
        });
        const data = await res.json();
        setCurrentQuestion(data.question);
        setPlayersRemaining(data.remaining);
        return;
      } catch (e) {
        console.error(e);
        setUseBackend(false);
      }
    }
    askNextQuestion(filteredPlayers);
  };

  // Update handleAnswer to use and update the currentFilteredPlayers
  const handleAnswer = async (answer: boolean): Promise<void> => {
    setQuestionsAsked((prev) => prev + 1);
    addLog(
      `Q${questionsAsked + 1}: ${currentQuestion} ${answer ? "Yes" : "No"}`
    );

    if (useBackend) {
      const nextAsked = [...asked, { question: currentQuestion, answer }];
      setAsked(nextAsked);
      try {
        // If remaining likely small, attempt guess
        const nextQ = await fetch(`${BACKEND_BASE}/next-question`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asked: nextAsked, candidate_ids: candidateIds }),
        });
        if (nextQ.ok) {
          const nq = await nextQ.json();
          setCurrentQuestion(nq.question);
          setPlayersRemaining(nq.remaining);
          if (nq.remaining <= 1) {
            const g = await fetch(`${BACKEND_BASE}/guess`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ asked: nextAsked, candidate_ids: candidateIds }),
            });
            if (g.ok) {
              const gj = await g.json();
              setGameState("result");
              setGuessedPlayer(gj.full_name);
              addLog(`My guess is... **${gj.full_name}**!`);
              return;
            }
          }
          return;
        }
      } catch (e) {
        console.error(e);
        setUseBackend(false);
      }
      // Fallback to local path below on error
    }

    // Handle final round (direct name confirmations)
    if (inFinalRound && currentQuestion.startsWith("Is your player ") && !currentQuestion.includes("one of these")) {
      const currentCandidate = finalCandidates[finalIndex];
      if (answer) {
        setGameState("result");
        setGuessedPlayer(currentCandidate.full_name);
        addLog(`🏀 My guess is... **${currentCandidate.full_name}**!`);
        return;
      } else {
        let nextIndex = finalIndex + 1;
        // advance to next with a valid non-empty name
        while (
          nextIndex < finalCandidates.length &&
          !(typeof finalCandidates[nextIndex].full_name === "string" && finalCandidates[nextIndex].full_name.trim().length > 0)
        ) {
          nextIndex += 1;
        }
        if (nextIndex < finalCandidates.length) {
          setFinalIndex(nextIndex);
          setCurrentQuestion(`Is your player ${finalCandidates[nextIndex].full_name}?`);
          setPlayersRemaining(finalCandidates.length - nextIndex);
          return;
        }
        // Exhausted candidates without a match
        setGameState("result");
        setGuessedPlayer("Unable to determine – no match in final list");
        addLog("Reached end of candidate list without confirmation.");
        return;
      }
    }

    let newFilteredPlayers = [...currentFilteredPlayers]; // Start with current filtered list

    if (currentQuestion.includes("Is your player one of these:")) {
      const mentionedPlayers = currentQuestion
        .replace("Is your player one of these: ", "")
        .replace("?", "")
        .split(", ");

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter((p) =>
          mentionedPlayers.includes(p.full_name)
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => !mentionedPlayers.includes(p.full_name)
        );
      }
    } else if (currentQuestion.includes("Is your player on the")) {
      const team = currentQuestion
        .replace("Is your player on the ", "")
        .replace("?", "");

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter((p) => p.team === team);
      } else {
        newFilteredPlayers = newFilteredPlayers.filter((p) => p.team !== team);
      }
    } else if (currentQuestion.includes("strictly a Guard")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position === "G"
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position !== "G"
        );
      }
    } else if (currentQuestion.includes("strictly a Forward")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position === "F"
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position !== "F"
        );
      }
    } else if (currentQuestion.includes("strictly a Center")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position === "C"
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position !== "C"
        );
      }
    } else if (currentQuestion.includes("Guard-Forward")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position === "G-F"
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position !== "G-F"
        );
      }
    } else if (currentQuestion.includes("Forward-Center")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position === "F-C"
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.position !== "F-C"
        );
      }
    } else if (currentQuestion.includes("received any awards")) {
      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.awards_count > 0
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.awards_count === 0
        );
      }
    } else if (currentQuestion.includes("older than")) {
      const ageMatch = currentQuestion.match(/older than (\d+)/);
      const age = ageMatch ? parseInt(ageMatch[1]) : 0;

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter((p) => p.age > age);
      } else {
        newFilteredPlayers = newFilteredPlayers.filter((p) => p.age <= age);
      }
    } else if (currentQuestion.includes("taller than")) {
      const heightMatch = currentQuestion.match(/taller than (\d+'\d+")/);
      const heightStr = heightMatch ? heightMatch[1] : "";
      const feet = parseInt(heightStr.split("'")[0]);
      const inches = parseInt(heightStr.split("'")[1].replace('"', ""));
      const heightInCm = (feet * 12 + inches) * 2.54;

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.height > heightInCm
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.height <= heightInCm
        );
      }
    } else if (currentQuestion.includes("heavier than")) {
      const weightMatch = currentQuestion.match(/heavier than (\d+)/);
      const weight = weightMatch ? parseInt(weightMatch[1]) : 0;

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.weight > weight
        );
      } else {
        newFilteredPlayers = newFilteredPlayers.filter(
          (p) => p.weight <= weight
        );
      }
    } else if (currentQuestion.includes("average more than")) {
      const statMatch = currentQuestion.match(
        /average more than (\d+\.\d+) (\w+)/
      );
      const value = statMatch ? parseFloat(statMatch[1]) : 0;
      const stat = statMatch ? `average_${statMatch[2]}` : "";

      if (answer) {
        newFilteredPlayers = newFilteredPlayers.filter((p: any) => {
          return p[stat as string as keyof Player] > value;
        });
      } else {
        newFilteredPlayers = newFilteredPlayers.filter((p: any) => {
          return p[stat as string as keyof Player] <= value;
        });
      }
    }

    // Update the current filtered players
    setCurrentFilteredPlayers(newFilteredPlayers);
    setPlayersRemaining(newFilteredPlayers.length);

    // If we have exactly one player left, we've found them
    if (newFilteredPlayers.length === 1) {
      setGameState("result");
      setGuessedPlayer(newFilteredPlayers[0].full_name);
      addLog(`My guess is... **${newFilteredPlayers[0].full_name}**!`);
    }
    // Otherwise ask the next question
    else {
      askNextQuestion(newFilteredPlayers);
    }
  };

  // Update resetGame to reset the currentFilteredPlayers
  const resetGame = () => {
    setGameState("intro");
    setConference(null);
    setCurrentQuestion("");
    setPlayersRemaining(0);
    setQuestionsAsked(0);
    setGuessedPlayer("");
    setLogMessages([]);
    setCurrentFilteredPlayers([]);
    setInFinalRound(false);
    setFinalCandidates([]);
    setFinalIndex(0);
    setAsked([]);
    setCandidateIds([]);
  };

  return (
    <div className="relative min-h-[80vh] w-full bg-gradient-to-br from-sky-50 via-indigo-50 to-fuchsia-50 py-10 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.08),transparent_60%)]" />
      <div className="relative w-full max-w-4xl mx-auto p-6 sm:p-8 bg-white/85 backdrop-blur-md rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] border border-white/60">
        <div className="text-center mb-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-fuchsia-600 bg-clip-text text-transparent">
            NBA Legend Guesser
          </h2>
          <p className="mt-2 text-gray-600">Think of an active player. I’ll find them in as few questions as possible.</p>
        </div>

      {isLoading ? (
        <div className="text-center py-8">
          <p>Loading player data...</p>
        </div>
      ) : (
        <>
          {/* Intro Screen */}
          {gameState === "intro" && (
            <div className="space-y-5 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium">
                <span>Twenty-Questions Challenge</span>
              </div>
              <p className="text-lg text-gray-800">Think of an active NBA player and I’ll try to guess who it is.</p>
              <p className="text-gray-600">Select your player's conference to begin:</p>
              <div className="flex justify-center gap-4 mt-2">
                <button
                  onClick={() => selectConference("East")}
                  className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-sm active:scale-[0.99]"
                >
                  Eastern Conference
                </button>
                <button
                  onClick={() => selectConference("West")}
                  className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-600 hover:to-orange-600 shadow-sm active:scale-[0.99]"
                >
                  Western Conference
                </button>
              </div>
            </div>
          )}

          {/* Game Playing Screen */}
          {gameState === "playing" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                  <span>Players remaining: {playersRemaining}</span>
                </span>
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  <span>Questions asked: {questionsAsked}</span>
                </span>
              </div>

              <div className="w-full bg-gray-200/70 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(5, (questionsAsked / 20) * 100))}%` }}
                />
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <p className="text-xl sm:text-2xl font-bold text-gray-900 text-center leading-snug">{currentQuestion}</p>
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={() => handleAnswer(true)}
                  className="px-8 py-3 rounded-xl font-semibold text-white bg-emerald-500 hover:bg-emerald-600 active:scale-[0.99] shadow-sm"
                >
                  Yes
                </button>
                <button
                  onClick={() => handleAnswer(false)}
                  className="px-8 py-3 rounded-xl font-semibold text-white bg-rose-500 hover:bg-rose-600 active:scale-[0.99] shadow-sm"
                >
                  No
                </button>
              </div>

              <div className="mt-2">
                <h3 className="font-semibold text-gray-700 mb-2">Game Log</h3>
                <div className="bg-white p-4 rounded-xl border border-gray-100 h-36 overflow-y-auto text-sm space-y-1">
                  {logMessages.map((msg, idx) => (
                    <p
                      key={idx}
                      className="text-gray-700"
                      dangerouslySetInnerHTML={{
                        __html: msg.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
                      }}
                    ></p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Result Screen */}
          {gameState === "result" && (
            <div className="space-y-6 text-center">
              <div className="py-3">
                <h2 className="text-2xl font-extrabold mb-2">Your player is:</h2>
                <p className="text-3xl sm:text-4xl font-extrabold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {guessedPlayer}
                </p>
              </div>

              <p className="text-gray-700">It took me {questionsAsked} questions to guess your player.</p>

              <div className="flex justify-center">
                <button
                  onClick={resetGame}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-7 py-3 rounded-xl font-semibold mt-2 shadow-sm"
                >
                  Play Again
                </button>
              </div>

              <div className="mt-4">
                <h3 className="font-medium text-gray-700 mb-1">Game Log:</h3>
                <div className="bg-gray-50 p-3 rounded-lg border h-32 overflow-y-auto text-sm">
                  {logMessages.map((msg, idx) => (
                    <p
                      key={idx}
                      className="mb-1"
                      dangerouslySetInnerHTML={{
                        __html: msg.replace(
                          /\*\*(.*?)\*\*/g,
                          "<strong>$1</strong>"
                        ),
                      }}
                    ></p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
};

export default GuessYourLegend;
