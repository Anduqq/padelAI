import type { TournamentDetail } from "./types";

const PUBLIC_APP_ORIGIN = "https://padel.anduhomelab.dev";

function leaderboardEmoji(rank: number) {
  if (rank === 1) {
    return "🥇";
  }
  if (rank === 2) {
    return "🥈";
  }
  if (rank === 3) {
    return "🥉";
  }
  return "🎾";
}

function leaderboardLines(tournament: TournamentDetail) {
  return tournament.leaderboard.map(
    (row) => `${leaderboardEmoji(row.rank)} ${row.rank}. ${row.display_name} - ${row.points} pts | ${row.wins}W ${row.losses}L`
  );
}

function tournamentLink(tournamentId: string) {
  return `${PUBLIC_APP_ORIGIN}/tournaments/${tournamentId}`;
}

export function buildTournamentShareText(tournament: TournamentDetail) {
  const champion = tournament.leaderboard[0];
  const lines = [
    `🏁 ${tournament.name} is finished.`,
    `🎾 Format: ${tournament.format.toUpperCase()}`,
    champion ? `🏆 Champion: ${champion.display_name}` : "",
    "",
    "📊 Final leaderboard:",
    ...leaderboardLines(tournament),
    "",
    `🔗 Live board: ${tournamentLink(tournament.id)}`
  ].filter(Boolean);
  return lines.join("\n");
}

export function openTournamentWhatsAppShare(tournament: TournamentDetail) {
  const text = encodeURIComponent(buildTournamentShareText(tournament));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}
