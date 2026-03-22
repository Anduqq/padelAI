import { useQuery } from "@tanstack/react-query";

import { AvatarBadge } from "../components/AvatarBadge";
import { EmptyState } from "../components/EmptyState";
import { api } from "../lib/api";

export function LeaderboardPage() {
  const leaderboardQuery = useQuery({
    queryKey: ["global-leaderboard"],
    queryFn: api.getGlobalLeaderboard
  });

  return (
    <section className="panel stack-section">
      <div className="split-row">
        <div>
          <p className="eyebrow">All-time table</p>
          <h2>Global leaderboard</h2>
        </div>
      </div>

      {leaderboardQuery.data && leaderboardQuery.data.length > 0 ? (
        <div className="table-wrap">
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>Place</th>
                <th className="leaderboard-player-cell">Player</th>
                <th className="leaderboard-optional-cell">Tournaments</th>
                <th>Points</th>
                <th>W</th>
                <th>L</th>
                <th>Diff</th>
                <th className="leaderboard-optional-cell">Matches</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardQuery.data.map((row) => (
                <tr key={row.player_id}>
                  <td>{row.rank}</td>
                  <td className="leaderboard-player-cell">
                    <div className="player-row">
                      <AvatarBadge name={row.display_name} seed={row.player_id} avatarUrl={row.avatar_url} size="md" />
                      <span>{row.display_name}</span>
                    </div>
                  </td>
                  <td className="leaderboard-optional-cell">{row.tournaments_played ?? 0}</td>
                  <td>{row.points}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>{row.game_diff}</td>
                  <td className="leaderboard-optional-cell">{row.matches_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon="🏁"
          title="No standings yet"
          description="As soon as the first scores land, this table will start showing who is running the club."
        />
      )}
    </section>
  );
}
