import type { ReactNode } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { api } from "../lib/api";
import type { User } from "../lib/types";

interface AppLayoutProps {
  currentUser: User;
  children?: ReactNode;
}

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
        queryClient.removeQueries({ queryKey: ["my-stats"] })
      ]);
      navigate("/login");
    }
  });

  return (
    <div className="screen-shell">
      <header className="topbar">
        <div className="topbar-title">
          <p className="eyebrow">IAR PADEL</p>
          <h1>Live tournament control</h1>
        </div>
        <div className="topbar-actions">
          <nav className="nav-pill">
            <NavLink to="/" end>
              Tournaments
            </NavLink>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            <NavLink to="/profile">My Stats</NavLink>
          </nav>
          <div className="user-chip">
            <span>
              {currentUser.display_name}
              {currentUser.is_admin ? <span className="admin-tag inline-tag">Admin</span> : null}
            </span>
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
