import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import { api } from "../lib/api";

const LAB_ICON = "\uD83E\uDDEA";
const PROD_ICON = "\uD83C\uDFD5";
const TEST_ICON = "\uD83E\uDDEA";
const PHOTO_ICON = "\uD83D\uDCF8";

export function AdminPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tournamentCount, setTournamentCount] = useState(100);

  const currentUserQuery = useQuery({
    queryKey: ["me"],
    queryFn: api.getCurrentUser
  });

  const overviewQuery = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.getAdminOverview,
    enabled: currentUserQuery.data?.is_admin === true
  });

  async function refreshScopeSensitiveQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["me"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["tournaments"] }),
      queryClient.invalidateQueries({ queryKey: ["tournament"] }),
      queryClient.invalidateQueries({ queryKey: ["global-leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["elo-leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["my-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["head-to-head"] }),
      queryClient.invalidateQueries({ queryKey: ["suggestions"] })
    ]);
  }

  const scopeMutation = useMutation({
    mutationFn: (scope: "prod" | "test") => api.setDataScope(scope),
    onSuccess: async (overview) => {
      queryClient.setQueryData(["admin-overview"], overview);
      queryClient.setQueryData(["me"], (currentUserQuery.data ? { ...currentUserQuery.data, data_scope: overview.current_scope } : currentUserQuery.data));
      await refreshScopeSensitiveQueries();
      navigate("/");
    }
  });

  const seedMutation = useMutation({
    mutationFn: () => api.seedTestData({ tournament_count: tournamentCount, replace_existing: true }),
    onSuccess: async (overview) => {
      queryClient.setQueryData(["admin-overview"], overview);
      await refreshScopeSensitiveQueries();
    }
  });

  const clearMutation = useMutation({
    mutationFn: api.clearTestData,
    onSuccess: async (overview) => {
      queryClient.setQueryData(["admin-overview"], overview);
      await refreshScopeSensitiveQueries();
    }
  });

  if (currentUserQuery.isLoading || overviewQuery.isLoading) {
    return <section className="panel">Loading admin tools...</section>;
  }

  if (!currentUserQuery.data?.is_admin) {
    return (
      <section className="panel stack-section">
        <p className="eyebrow">Admin</p>
        <h2>Admin tools are locked</h2>
        <p className="muted-text">Only the admin profile can switch between production and test data.</p>
      </section>
    );
  }

  if (!overviewQuery.data) {
    return <section className="panel">Admin overview is unavailable right now.</section>;
  }

  const overview = overviewQuery.data;

  return (
    <div className="stack-section">
      <section className="panel stack-section">
        <div className="split-row">
          <div>
            <p className="eyebrow">Admin {LAB_ICON}</p>
            <h2>Data control room</h2>
          </div>
          <span className={`status-badge ${overview.current_scope === "prod" ? "status-completed" : "status-draft"}`}>
            {overview.current_scope === "prod" ? "Production data" : "Test data"}
          </span>
        </div>
        <p className="muted-text compact-copy">
          Use this page to swap your browser between the live club data and a disposable test sandbox. The switch is
          instant for this browser only, and all tournament, leaderboard, Elo, and stats screens follow it.
        </p>

        <div className="admin-scope-grid">
          <article className={`admin-scope-card ${overview.current_scope === "prod" ? "admin-scope-card-active" : ""}`}>
            <span className="admin-scope-icon" aria-hidden="true">{PROD_ICON}</span>
            <strong>Production</strong>
            <span className="muted-text">{overview.prod_tournaments} tournaments</span>
            <button
              type="button"
              className={overview.current_scope === "prod" ? "secondary-button" : "ghost-button"}
              disabled={scopeMutation.isPending || overview.current_scope === "prod"}
              onClick={() => scopeMutation.mutate("prod")}
            >
              {overview.current_scope === "prod" ? "Currently live" : "Switch to production"}
            </button>
          </article>

          <article className={`admin-scope-card ${overview.current_scope === "test" ? "admin-scope-card-active admin-scope-card-test" : "admin-scope-card-test"}`}>
            <span className="admin-scope-icon" aria-hidden="true">{TEST_ICON}</span>
            <strong>Test sandbox</strong>
            <span className="muted-text">{overview.test_tournaments} tournaments</span>
            <button
              type="button"
              className={overview.current_scope === "test" ? "secondary-button" : "ghost-button"}
              disabled={scopeMutation.isPending || overview.current_scope === "test"}
              onClick={() => scopeMutation.mutate("test")}
            >
              {overview.current_scope === "test" ? "Currently testing" : "Switch to test"}
            </button>
          </article>
        </div>

        {scopeMutation.error ? <p className="error-text">{scopeMutation.error.message}</p> : null}
      </section>

      <section className="panel stack-section">
        <div className="split-row">
          <div>
            <p className="eyebrow">Test data</p>
            <h3>Rebuild the sandbox</h3>
          </div>
          <span className="muted-text">Default: 100 tournaments with completed, active, and draft sessions.</span>
        </div>

        <div className="inline-form">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={300}
            value={tournamentCount}
            onChange={(event) => setTournamentCount(Number(event.target.value))}
          />
          <button
            type="button"
            className="danger-button"
            disabled={seedMutation.isPending}
            onClick={() => seedMutation.mutate()}
          >
            {seedMutation.isPending ? "Building sandbox..." : "Seed test world"}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            {clearMutation.isPending ? "Clearing..." : "Clear test data"}
          </button>
        </div>

        <p className="muted-text compact-copy">
          Seeding wipes the old test tournaments, generates a fresh sandbox, and keeps your real production history
          untouched. Players are shared so your avatar/photo work still carries across both spaces.
        </p>

        {seedMutation.error ? <p className="error-text">{seedMutation.error.message}</p> : null}
        {clearMutation.error ? <p className="error-text">{clearMutation.error.message}</p> : null}
      </section>

      <section className="panel stack-section">
        <div className="split-row">
          <div>
            <p className="eyebrow">Player media</p>
            <h3>Photo desk</h3>
          </div>
          <span className="muted-text">{PHOTO_ICON} Avatar uploads stay in My Stats</span>
        </div>
        <p className="muted-text compact-copy">
          Open My Stats to upload your own photo or manage player avatars as admin. Those images are shared in both
          production and test views.
        </p>
        <Link className="secondary-button" to="/profile">
          Open My Stats photo desk
        </Link>
      </section>
    </div>
  );
}
