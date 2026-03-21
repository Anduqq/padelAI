import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { api, ApiError } from "./lib/api";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EloPage } from "./pages/EloPage";
import { HeadToHeadPage } from "./pages/HeadToHeadPage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { TournamentPage } from "./pages/TournamentPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry(failureCount, error) {
        if (error instanceof ApiError && error.status < 500) {
          return false;
        }
        return failureCount < 1;
      }
    }
  }
});

function LoadingScreen() {
  return (
    <div className="screen-shell centered-screen">
      <div className="panel">
        <p className="eyebrow">Padel tournament</p>
        <h1>Loading your club board</h1>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.getCurrentUser,
    retry: false
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!data) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout currentUser={data}>
      <Outlet />
    </AppLayout>
  );
}

function LoginRoute() {
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.getCurrentUser,
    retry: false
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (data) {
    return <Navigate to="/" replace />;
  }

  return <AuthPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/" element={<RequireAuth />}>
            <Route index element={<DashboardPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="elo" element={<EloPage />} />
            <Route path="compare" element={<HeadToHeadPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="tournaments/:tournamentId" element={<TournamentPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
