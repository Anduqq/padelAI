import type { ReactNode } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import type { User } from "../lib/types";
import { AvatarBadge } from "./AvatarBadge";

interface AppLayoutProps {
  currentUser: User;
  children?: ReactNode;
}

const navItems = [
  { to: "/", label: "Tournaments" },
  { to: "/leaderboard", label: "Leaderboard" },
  { to: "/elo", label: "Elo" },
  { to: "/compare", label: "Compare" },
  { to: "/profile", label: "My Stats" }
];

export function AppLayout({ currentUser, children }: AppLayoutProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      queryClient.setQueryData(["me"], null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.removeQueries({ queryKey: ["tournament"] }),
        queryClient.removeQueries({ queryKey: ["tournaments"] }),
        queryClient.removeQueries({ queryKey: ["global-leaderboard"] }),
        queryClient.removeQueries({ queryKey: ["elo-leaderboard"] }),
        queryClient.removeQueries({ queryKey: ["my-stats"] })
      ]);
      navigate("/login");
    }
  });

  return (
    <div className="screen-shell app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">Padel tournament</p>
          <h1>Club board</h1>
        </div>

        <nav className="nav-pill app-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-actions">
          <div className="user-chip">
            <div className="player-row">
              <AvatarBadge
                name={currentUser.display_name}
                seed={currentUser.player_id}
                avatarUrl={currentUser.avatar_url}
                size="sm"
              />
              <span>
                {currentUser.display_name}
                {currentUser.is_admin ? <span className="admin-tag inline-tag">Admin</span> : null}
              </span>
            </div>
            <button type="button" className="ghost-button" onClick={() => logoutMutation.mutate()}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell">{children ?? <Outlet />}</main>
    </div>
  );
}
