import { startTransition, useDeferredValue, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";

export function AuthPage() {
  const [playerSearch, setPlayerSearch] = useState("");
  const deferredSearch = useDeferredValue(playerSearch);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const optionsQuery = useQuery({
    queryKey: ["login-options"],
    queryFn: api.getLoginOptions
  });

  const loginMutation = useMutation({
    mutationFn: (playerId: string) => api.selectPlayerLogin({ player_id: playerId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      startTransition(() => navigate("/"));
    }
  });

  const filteredPlayers =
    optionsQuery.data?.filter((player) =>
      player.display_name.toLowerCase().includes(deferredSearch.trim().toLowerCase())
    ) ?? [];

  return (
    <div className="screen-shell auth-shell">
      <section className="hero-panel">
        <p className="eyebrow">IAR PADEL</p>
        <h1>Pick a saved player and jump straight into the board.</h1>
        <p className="muted-text">
          The app now keeps sign-in lightweight: every saved player appears here, and you can create new players from
          the tournament screen whenever someone new joins.
        </p>
        <div className="hero-grid">
          <div className="panel inset-panel">
            <strong>Fast entry</strong>
            <p>No email flow, no password reset loop, just a player pick list with your saved names.</p>
          </div>
          <div className="panel inset-panel">
            <strong>Club continuity</strong>
            <p>Player suggestions, private stats, and tournament history stay tied to the same saved profile.</p>
          </div>
        </div>
      </section>

      <section className="panel auth-panel">
        <div className="split-row">
          <div>
            <p className="eyebrow">Choose player</p>
            <h2>Open your session</h2>
          </div>
          <span className="muted-text">{optionsQuery.data?.length ?? 0} saved players</span>
        </div>

        <label className="stack-form">
          <span>Search saved players</span>
          <input
            value={playerSearch}
            placeholder="Filter the player list"
            onChange={(event) => setPlayerSearch(event.target.value)}
          />
        </label>

        {optionsQuery.error ? <p className="error-text">{optionsQuery.error.message}</p> : null}
        {loginMutation.error ? <p className="error-text">{loginMutation.error.message}</p> : null}

        <div className="player-popup-grid">
          {filteredPlayers.map((player) => (
            <button
              type="button"
              key={player.player_id}
              className="player-popup"
              disabled={loginMutation.isPending}
              onClick={() => loginMutation.mutate(player.player_id)}
            >
              <strong>{player.display_name}</strong>
              <span className="popup-meta">
                {player.is_admin ? <span className="admin-tag">Admin</span> : <span>Saved player</span>}
              </span>
            </button>
          ))}
        </div>

        {!optionsQuery.isLoading && filteredPlayers.length === 0 ? (
          <p className="muted-text empty-state">No saved player matches that search yet.</p>
        ) : null}
      </section>
    </div>
  );
}
