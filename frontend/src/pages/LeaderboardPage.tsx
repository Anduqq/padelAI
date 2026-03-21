import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

export function LeaderboardPage() {
  const leaderboardQuery = useQuery({
    queryKey: ["global-leaderboard"],
    queryFn: api.getGlobalLeaderboard
  });

  return (
    <section className="panel">
      <p className="eyebrow">All-time table 🏆</p>
      <h2>Global leaderboard</h2>
      <div className="table-wrap">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th>#</th>
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
            {leaderboardQuery.data?.map((row) => (
              <tr key={row.player_id}>
                <td>{row.rank}</td>
                <td className="leaderboard-player-cell">{row.display_name}</td>
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
    </section>
  );
}
