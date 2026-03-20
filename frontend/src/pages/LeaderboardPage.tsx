import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

export function LeaderboardPage() {
  const leaderboardQuery = useQuery({
    queryKey: ["global-leaderboard"],
    queryFn: api.getGlobalLeaderboard
  });

  return (
    <section className="panel">
      <p className="eyebrow">All-time table</p>
      <h2>Global leaderboard</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Tournaments</th>
              <th>Points</th>
              <th>Diff</th>
              <th>Matches</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardQuery.data?.map((row) => (
              <tr key={row.player_id}>
                <td>{row.rank}</td>
                <td>{row.display_name}</td>
                <td>{row.tournaments_played ?? 0}</td>
                <td>{row.points}</td>
                <td>{row.game_diff}</td>
                <td>{row.matches_played}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
