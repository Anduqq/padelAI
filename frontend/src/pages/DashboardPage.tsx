import { startTransition, useDeferredValue, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { TournamentCard } from "../components/TournamentCard";
import { api } from "../lib/api";

export function DashboardPage() {
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"americano" | "mexicano">("americano");
  const [courtCount, setCourtCount] = useState(2);
  const [targetRounds, setTargetRounds] = useState(5);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const deferredSearch = useDeferredValue(playerSearch);

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tournamentsQuery = useQuery({ queryKey: ["tournaments"], queryFn: api.getTournaments });
  const playersQuery = useQuery({ queryKey: ["players"], queryFn: api.getPlayers });
  const suggestionsQuery = useQuery({ queryKey: ["suggestions"], queryFn: api.getSuggestions });

  const createTournament = useMutation({
    mutationFn: () =>
      api.createTournament({
        name,
        format,
        court_count: courtCount,
        target_rounds: format === "mexicano" ? targetRounds : null,
        participant_ids: selectedPlayers
      }),
    onSuccess: async (tournament) => {
      await queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      startTransition(() => navigate(`/tournaments/${tournament.id}`));
    }
  });

  const filteredPlayers =
    playersQuery.data?.filter((player) =>
      player.display_name.toLowerCase().includes(deferredSearch.trim().toLowerCase())
    ) ?? [];

  function togglePlayer(playerId: string) {
    setSelectedPlayers((current) =>
      current.includes(playerId) ? current.filter((item) => item !== playerId) : [...current, playerId]
    );
  }

  const requiredPlayers = courtCount * 4;
  const completedTournaments = tournamentsQuery.data?.filter((item) => item.status === "completed") ?? [];

  return (
    <div className="dashboard-grid">
      <section className="panel">
        <p className="eyebrow">Create tournament</p>
        <h2>Set up the next session</h2>
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTournament.mutate();
          }}
        >
          <label>
            <span>Tournament name</span>
            <input
              value={name}
              placeholder="Wednesday evening league"
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <div className="form-row">
            <label>
              <span>Format</span>
              <select value={format} onChange={(event) => setFormat(event.target.value as "americano" | "mexicano")}>
                <option value="americano">Americano</option>
                <option value="mexicano">Mexicano</option>
              </select>
            </label>
            <label>
              <span>Courts</span>
              <input
                type="number"
                min={1}
                max={8}
                value={courtCount}
                onChange={(event) => setCourtCount(Number(event.target.value))}
              />
            </label>
          </div>

          {format === "mexicano" ? (
            <label>
              <span>Target rounds</span>
              <input
                type="number"
                min={1}
                max={30}
                value={targetRounds}
                onChange={(event) => setTargetRounds(Number(event.target.value))}
              />
            </label>
          ) : null}

          <label>
            <span>Search players</span>
            <input
              value={playerSearch}
              placeholder="Filter the saved player list"
              onChange={(event) => setPlayerSearch(event.target.value)}
            />
          </label>

          <div className="selection-summary">
            <strong>
              {selectedPlayers.length}/{requiredPlayers}
            </strong>
            <span>players selected</span>
          </div>

          <div className="chip-list">
            {filteredPlayers.map((player) => (
              <button
                type="button"
                key={player.id}
                className={selectedPlayers.includes(player.id) ? "chip chip-active" : "chip"}
                onClick={() => togglePlayer(player.id)}
              >
                {player.display_name}
              </button>
            ))}
          </div>

          {suggestionsQuery.data && suggestionsQuery.data.length > 0 ? (
            <div className="suggestion-strip">
              <p className="eyebrow">Suggested from recent history</p>
              <div className="chip-list">
                {suggestionsQuery.data.slice(0, 8).map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.player_id}
                    className={selectedPlayers.includes(suggestion.player_id) ? "chip chip-active" : "chip"}
                    onClick={() => togglePlayer(suggestion.player_id)}
                  >
                    {suggestion.display_name} - {suggestion.frequency}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {createTournament.error ? <p className="error-text">{createTournament.error.message}</p> : null}

          <button
            type="submit"
            className="primary-button"
            disabled={createTournament.isPending || selectedPlayers.length !== requiredPlayers}
          >
            {createTournament.isPending ? "Creating..." : "Create tournament"}
          </button>
        </form>
      </section>

      <section className="stack-section">
        <section className="panel">
          <div className="split-row">
            <div>
              <p className="eyebrow">Active board</p>
              <h2>Recent tournaments</h2>
            </div>
            <span className="muted-text">{tournamentsQuery.data?.length ?? 0} total</span>
          </div>
          <div className="card-grid">
            {tournamentsQuery.data?.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Archive</p>
          <h2>Completed tournaments</h2>
          <div className="card-grid">
            {completedTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
            {completedTournaments.length === 0 ? <p className="muted-text">Completed events will show up here.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
