import { startTransition, useDeferredValue, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import { AvatarBadge } from "../components/AvatarBadge";

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
    <div className="screen-shell centered-screen">
      <section className="panel auth-panel">
        <div className="split-row">
          <div>
            <h2>Choose player</h2>
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
              <div className="player-row">
                <AvatarBadge name={player.display_name} seed={player.player_id} avatarUrl={player.avatar_url} size="lg" />
                <strong>{player.display_name}</strong>
              </div>
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
