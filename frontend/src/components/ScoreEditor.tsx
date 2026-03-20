import { useEffect, useState } from "react";

import type { MatchItem, ScoringSystem } from "../lib/types";

type WinnerSide = "team_a" | "team_b";

interface ScoreEditorProps {
  match: MatchItem;
  disabled: boolean;
  scoringSystem: ScoringSystem;
  americanoPointsTarget: number | null;
  onSubmit: (payload: { team_a_games: number; team_b_games: number; version: number }) => void;
}

function deriveAmericanoState(match: MatchItem, target: number | null) {
  if (target === null) {
    return { winner: null as WinnerSide | null, loserScore: null as number | null };
  }
  if (match.team_a_games === target && match.team_b_games !== null && match.team_b_games < target) {
    return { winner: "team_a" as WinnerSide, loserScore: match.team_b_games };
  }
  if (match.team_b_games === target && match.team_a_games !== null && match.team_a_games < target) {
    return { winner: "team_b" as WinnerSide, loserScore: match.team_a_games };
  }
  return { winner: null as WinnerSide | null, loserScore: null as number | null };
}

export function ScoreEditor({ match, disabled, scoringSystem, americanoPointsTarget, onSubmit }: ScoreEditorProps) {
  const [teamAGames, setTeamAGames] = useState(match.team_a_games ?? 0);
  const [teamBGames, setTeamBGames] = useState(match.team_b_games ?? 0);
  const americanoState = deriveAmericanoState(match, americanoPointsTarget);
  const [winner, setWinner] = useState<WinnerSide | null>(americanoState.winner);
  const [loserScore, setLoserScore] = useState<number | null>(americanoState.loserScore);

  useEffect(() => {
    setTeamAGames(match.team_a_games ?? 0);
    setTeamBGames(match.team_b_games ?? 0);
    setWinner(americanoState.winner);
    setLoserScore(americanoState.loserScore);
  }, [americanoState.loserScore, americanoState.winner, match.team_a_games, match.team_b_games]);

  function submitAmericanoScore(nextWinner = winner, nextLoserScore = loserScore) {
    if (nextWinner === null || nextLoserScore === null || americanoPointsTarget === null) {
      return;
    }

    onSubmit({
      team_a_games: nextWinner === "team_a" ? americanoPointsTarget : nextLoserScore,
      team_b_games: nextWinner === "team_b" ? americanoPointsTarget : nextLoserScore,
      version: match.version
    });
  }

  function toggleLosingScore(nextScore: number) {
    if (disabled) {
      return;
    }

    setLoserScore((current) => (current === nextScore ? null : nextScore));
  }

  if (scoringSystem === "americano_points" && americanoPointsTarget !== null) {
    const canSubmit = winner !== null && loserScore !== null;
    const preview =
      winner === null || loserScore === null
        ? "- : -"
        : winner === "team_a"
          ? `${americanoPointsTarget} : ${loserScore}`
          : `${loserScore} : ${americanoPointsTarget}`;

    return (
      <section className="score-editor americano-editor">
        <div className="winner-grid">
          <button
            type="button"
            className={winner === "team_a" ? "winner-button winner-button-active" : "winner-button"}
            disabled={disabled}
            onClick={() => {
              setWinner("team_a");
              setLoserScore((current) => current ?? 0);
            }}
          >
            <span className="score-field-label">Winner</span>
            <strong>{match.team_a.map((player) => player.display_name).join(" / ")}</strong>
          </button>
          <button
            type="button"
            className={winner === "team_b" ? "winner-button winner-button-active" : "winner-button"}
            disabled={disabled}
            onClick={() => {
              setWinner("team_b");
              setLoserScore((current) => current ?? 0);
            }}
          >
            <span className="score-field-label">Winner</span>
            <strong>{match.team_b.map((player) => player.display_name).join(" / ")}</strong>
          </button>
        </div>

        <div className="score-chip-section">
          <p className="muted-text score-helper">Pick the losing score. The winner always reaches {americanoPointsTarget}.</p>
          <div className="score-chip-grid">
            {Array.from({ length: americanoPointsTarget }, (_, index) => (
              <button
                type="button"
                key={index}
                className={loserScore === index ? "score-chip score-chip-active" : "score-chip"}
                aria-pressed={loserScore === index}
                disabled={disabled}
                onClick={() => toggleLosingScore(index)}
              >
                {index}
              </button>
            ))}
          </div>
        </div>

        <div className="score-preview">
          <span className="score-field-label">Preview</span>
          <strong className="score-field-value">{preview}</strong>
        </div>

        <button
          type="button"
          className="primary-button"
          disabled={disabled || !canSubmit}
          onClick={() => submitAmericanoScore()}
        >
          Save points
        </button>
      </section>
    );
  }

  return (
    <form
      className="score-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          team_a_games: teamAGames,
          team_b_games: teamBGames,
          version: match.version
        });
      }}
    >
      <label className="score-field">
        <span className="score-field-label">{match.team_a.map((player) => player.display_name).join(" / ")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={teamAGames}
          disabled={disabled}
          onChange={(event) => setTeamAGames(Number(event.target.value))}
        />
      </label>
      <label className="score-field">
        <span className="score-field-label">{match.team_b.map((player) => player.display_name).join(" / ")}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          value={teamBGames}
          disabled={disabled}
          onChange={(event) => setTeamBGames(Number(event.target.value))}
        />
      </label>
      <p className="muted-text score-helper">Enter the final match score.</p>
      <button type="submit" className="primary-button" disabled={disabled}>
        Save score
      </button>
    </form>
  );
}
