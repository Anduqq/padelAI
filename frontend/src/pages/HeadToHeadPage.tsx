import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { AvatarBadge } from "../components/AvatarBadge";
import { EmptyState } from "../components/EmptyState";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

export function HeadToHeadPage() {
  const [playerAId, setPlayerAId] = useState("");
  const [playerBId, setPlayerBId] = useState("");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getCurrentUser,
    retry: false
  });
  const playersQuery = useQuery({
    queryKey: ["players"],
    queryFn: api.getPlayers
  });

  useEffect(() => {
    if (!meQuery.data?.player_id || !playersQuery.data || playerAId || playerBId) {
      return;
    }

    setPlayerAId(meQuery.data.player_id);
    const opponent = playersQuery.data.find((player) => player.id !== meQuery.data?.player_id);
    if (opponent) {
      setPlayerBId(opponent.id);
    }
  }, [meQuery.data, playerAId, playerBId, playersQuery.data]);

  const compareQuery = useQuery({
    queryKey: ["head-to-head", playerAId, playerBId],
    queryFn: () => api.getHeadToHead(playerAId, playerBId),
    enabled: Boolean(playerAId && playerBId && playerAId !== playerBId)
  });

  if (playersQuery.data && playersQuery.data.length < 2) {
    return (
      <section className="panel">
        <EmptyState
          icon="🤝"
          title="Not enough players yet"
          description="Add at least two saved players and this comparison board will light up."
        />
      </section>
    );
  }

  return (
    <div className="stack-section">
      <section className="panel stack-form">
        <div>
          <p className="eyebrow">Compare players</p>
          <h2>Head-to-head</h2>
        </div>

        <div className="form-row">
          <label>
            <span>Player one</span>
            <select value={playerAId} onChange={(event) => setPlayerAId(event.target.value)}>
              <option value="">Choose player</option>
              {playersQuery.data?.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Player two</span>
            <select value={playerBId} onChange={(event) => setPlayerBId(event.target.value)}>
              <option value="">Choose player</option>
              {playersQuery.data?.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {compareQuery.data ? (
        <>
          <section className="head-to-head-grid">
            {[compareQuery.data.player_a, compareQuery.data.player_b].map((player) => (
              <article key={player.player_id} className="panel player-spotlight">
                <AvatarBadge name={player.display_name} seed={player.player_id} avatarUrl={player.avatar_url} size="lg" />
                <strong>{player.display_name}</strong>
              </article>
            ))}
          </section>

          <section className="stat-grid">
            <div className="stat-card">
              <span className="stat-label">Against each other</span>
              <strong className="stat-value">{compareQuery.data.against.matches}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">{compareQuery.data.player_a.display_name} wins</span>
              <strong className="stat-value">{compareQuery.data.against.player_a_wins}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">{compareQuery.data.player_b.display_name} wins</span>
              <strong className="stat-value">{compareQuery.data.against.player_b_wins}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Played together</span>
              <strong className="stat-value">{compareQuery.data.together.matches}</strong>
            </div>
          </section>

          <section className="panel stack-section">
            <div className="split-row">
              <h3>Recent meetings</h3>
              <span className="muted-text">
                {compareQuery.data.against.player_a_points} - {compareQuery.data.against.player_b_points} all-time points
              </span>
            </div>

            {compareQuery.data.recent_meetings.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tournament</th>
                      <th>Score</th>
                      <th>Result</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareQuery.data.recent_meetings.map((meeting) => (
                      <tr key={meeting.match_id}>
                        <td>{meeting.tournament_name}</td>
                        <td>
                          {meeting.player_a_points} - {meeting.player_b_points}
                        </td>
                        <td>{meeting.result}</td>
                        <td>{formatDate(meeting.played_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon="🪞"
                title="No rivalry yet"
                description="These two players have not faced each other yet, so the board is still a blank page."
              />
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <EmptyState
            icon="🆚"
            title="Pick two players"
            description="Choose any two saved players to see their rivalry and their chemistry as a pair."
          />
        </section>
      )}
    </div>
  );
}
