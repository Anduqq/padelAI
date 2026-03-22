import { useQuery } from "@tanstack/react-query";

import { AvatarBadge } from "../components/AvatarBadge";
import { EmptyState } from "../components/EmptyState";
import { api } from "../lib/api";

export function EloPage() {
  const eloQuery = useQuery({
    queryKey: ["elo-leaderboard"],
    queryFn: api.getEloLeaderboard
  });

  return (
    <section className="panel stack-section">
      <div>
        <p className="eyebrow">Rating ladder</p>
        <h2>Elo leaderboard</h2>
        <p className="muted-text compact-copy">
          This table rewards strong results against strong teams, so it can move differently from the standard points
          leaderboard.
        </p>
      </div>

      {eloQuery.data && eloQuery.data.length > 0 ? (
        <div className="table-wrap">
          <table className="leaderboard-table compact-leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th className="leaderboard-player-cell">Player</th>
                <th>Elo</th>
                <th>W</th>
                <th>L</th>
                <th className="leaderboard-optional-cell">Matches</th>
              </tr>
            </thead>
            <tbody>
              {eloQuery.data.map((row) => (
                <tr key={row.player_id}>
                  <td>{row.rank}</td>
                  <td className="leaderboard-player-cell">
                    <div className="player-row">
                      <AvatarBadge name={row.display_name} seed={row.player_id} avatarUrl={row.avatar_url} size="md" />
                      <span>{row.display_name}</span>
                    </div>
                  </td>
                  <td>
                    <strong>{row.rating}</strong>
                  </td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td className="leaderboard-optional-cell">{row.matches_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon="📈"
          title="Elo will wake up soon"
          description="Once the first completed matches are in, the rating ladder will start shifting."
        />
      )}
    </section>
  );
}
