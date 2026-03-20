import { startTransition, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api } from "../lib/api";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === "login") {
        return api.login({ email, password });
      }

      return api.register({
        email,
        password,
        full_name: fullName,
        display_name: displayName
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      startTransition(() => navigate("/"));
    }
  });

  return (
    <div className="screen-shell auth-shell">
      <section className="hero-panel">
        <p className="eyebrow">Private club app</p>
        <h1>Track Americano and dynamic Mexicano tournaments in one place.</h1>
        <p className="muted-text">
          Live scoring, player suggestions from past attendance, private stats, and tournament history are all built
          into the same board.
        </p>
        <div className="hero-grid">
          <div className="panel inset-panel">
            <strong>Live collaboration</strong>
            <p>Multiple players can update scores and the tournament board refreshes instantly.</p>
          </div>
          <div className="panel inset-panel">
            <strong>Mexicano flow</strong>
            <p>Each next round is generated from the current standings, not pre-baked up front.</p>
          </div>
        </div>
      </section>

      <section className="panel auth-panel">
        <div className="split-row">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h2>{mode === "login" ? "Sign in" : "Create your account"}</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Need an account?" : "Have an account?"}
          </button>
        </div>

        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {mode === "register" ? (
            <>
              <label>
                <span>Full name</span>
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
              </label>
              <label>
                <span>Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
            </>
          ) : null}
          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
          </label>
          {mutation.error ? <p className="error-text">{mutation.error.message}</p> : null}
          <button type="submit" className="primary-button" disabled={mutation.isPending}>
            {mutation.isPending ? "Working..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </section>
    </div>
  );
}
