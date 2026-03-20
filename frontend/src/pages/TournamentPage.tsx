import { useEffect } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { ScoreEditor } from "../components/ScoreEditor";
import { api } from "../lib/api";
import { formatDate, formatStatus } from "../lib/format";

export function TournamentPage() {
  const { tournamentId = "" } = useParams();
  const queryClient = useQueryClient();
  const tournamentQuery = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: () => api.getTournament(tournamentId),
    enabled: tournamentId.length > 0
  });

  useEffect(() => {
    if (!tournamentId) {
      return undefined;
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws/tournaments/${tournamentId}`);

    socket.onopen = () => {
      socket.send("ready");
    };

    socket.onmessage = async () => {
      await queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
    };

    return () => socket.close();
  }, [queryClient, tournamentId]);

  const startMutation = useMutation({
    mutationFn: () => api.startTournament(tournamentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    }
  });

  const nextRoundMutation = useMutation({
    mutationFn: () => api.generateNextRound(tournamentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
    }
  });

  const scoreMutation = useMutation({
    mutationFn: (payload: { matchId: string; team_a_games: number; team_b_games: number; version: number }) =>
      api.updateScore(payload.matchId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      await queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stats"] });
    }
  });

  if (tournamentQuery.isLoading) {
    return <section className="panel">Loading tournament...</section>;
  }

  if (!tournamentQuery.data) {
    return <section className="panel">Tournament not found.</section>;
  }

  const tournament = tournamentQuery.data;

  return (
    <div className="stack-section">
      <section className="panel">
        <div className="split-row">
          <div>
            <p className="eyebrow">{tournament.format}</p>
            <h2>{tournament.name}</h2>
          </div>
          <span className={`status-badge status-${tournament.status}`}>{formatStatus(tournament.status)}</span>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span>Players</span>
            <strong>{tournament.participants.length}</strong>
          </div>
          <div className="stat-card">
            <span>Courts</span>
            <strong>{tournament.court_count}</strong>
          </div>
          <div className="stat-card">
            <span>Rounds target</span>
            <strong>{tournament.target_rounds ?? "Auto"}</strong>
          </div>
          <div className="stat-card">
            <span>Started</span>
            <strong>{formatDate(tournament.started_at)}</strong>
          </div>
        </div>

        <div className="split-row">
          <div>
            <p className="muted-text">Participants</p>
            <div className="chip-list">
              {tournament.participants.map((participant) => (
                <span key={participant.player_id} className="chip chip-static">
                  {participant.display_name}
                </span>
              ))}
            </div>
          </div>
          <div className="action-row">
            {tournament.status === "draft" ? (
              <button type="button" className="primary-button" onClick={() => startMutation.mutate()}>
                {startMutation.isPending ? "Starting..." : "Start tournament"}
              </button>
            ) : null}
            {tournament.can_generate_next_round ? (
              <button type="button" className="primary-button" onClick={() => nextRoundMutation.mutate()}>
                {nextRoundMutation.isPending ? "Generating..." : "Generate next Mexicano round"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="page-columns">
        <section className="panel">
          <p className="eyebrow">Tournament leaderboard</p>
          <h3>Current standings</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Player</th>
                  <th>Points</th>
                  <th>Diff</th>
                  <th>W</th>
                  <th>L</th>
                </tr>
              </thead>
              <tbody>
                {tournament.leaderboard.map((row) => (
                  <tr key={row.player_id}>
                    <td>{row.rank}</td>
                    <td>{row.display_name}</td>
                    <td>{row.points}</td>
                    <td>{row.game_diff}</td>
                    <td>{row.wins}</td>
                    <td>{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Live rounds</p>
          <h3>Score input</h3>
          <div className="round-stack">
            {tournament.rounds.map((round) => (
              <article key={round.id} className="round-card">
                <div className="split-row">
                  <div>
                    <strong>Round {round.number}</strong>
                    <p className="muted-text">{formatStatus(round.status)}</p>
                  </div>
                  <span className={`status-badge status-${round.status}`}>{formatStatus(round.status)}</span>
                </div>

                {round.metadata?.bench_players && round.metadata.bench_players.length > 0 ? (
                  <div className="bench-strip">
                    <span className="muted-text">Bench</span>
                    <div className="chip-list">
                      {round.metadata.bench_players.map((player) => (
                        <span key={player.player_id} className="chip chip-static">
                          {player.display_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="match-stack">
                  {round.matches.map((match) =>
                    round.status === "active" ? (
                      <ScoreEditor
                        key={match.id}
                        match={match}
                        disabled={scoreMutation.isPending}
                        onSubmit={(payload) =>
                          scoreMutation.mutate({
                            matchId: match.id,
                            ...payload
                          })
                        }
                      />
                    ) : (
                      <div key={match.id} className="score-summary">
                        <div>
                          <strong>Court {match.court_number}</strong>
                          <p className="muted-text">
                            {match.team_a.map((item) => item.display_name).join(" / ")} vs{" "}
                            {match.team_b.map((item) => item.display_name).join(" / ")}
                          </p>
                        </div>
                        <strong>
                          {match.team_a_games ?? "-"} : {match.team_b_games ?? "-"}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
          {scoreMutation.error ? <p className="error-text">{scoreMutation.error.message}</p> : null}
        </section>
      </section>
    </div>
  );
}
