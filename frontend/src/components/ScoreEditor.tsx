import { useEffect, useState } from "react";

import type { MatchItem } from "../lib/types";

interface ScoreEditorProps {
  match: MatchItem;
  disabled: boolean;
  onSubmit: (payload: { team_a_games: number; team_b_games: number; version: number }) => void;
}

export function ScoreEditor({ match, disabled, onSubmit }: ScoreEditorProps) {
  const [teamAGames, setTeamAGames] = useState(match.team_a_games ?? 0);
  const [teamBGames, setTeamBGames] = useState(match.team_b_games ?? 0);

  useEffect(() => {
    setTeamAGames(match.team_a_games ?? 0);
    setTeamBGames(match.team_b_games ?? 0);
  }, [match.team_a_games, match.team_b_games]);

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
      <label>
        <span>{match.team_a.map((player) => player.display_name).join(" / ")}</span>
        <input
          type="number"
          min={0}
          max={99}
          value={teamAGames}
          disabled={disabled}
          onChange={(event) => setTeamAGames(Number(event.target.value))}
        />
      </label>
      <label>
        <span>{match.team_b.map((player) => player.display_name).join(" / ")}</span>
        <input
          type="number"
          min={0}
          max={99}
          value={teamBGames}
          disabled={disabled}
          onChange={(event) => setTeamBGames(Number(event.target.value))}
        />
      </label>
      <button type="submit" className="primary-button" disabled={disabled}>
        Save score
      </button>
    </form>
  );
}
