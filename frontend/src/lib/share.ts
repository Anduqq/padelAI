import type { TournamentDetail } from "./types";

function topThreeLines(tournament: TournamentDetail) {
  return tournament.leaderboard.slice(0, 3).map((row, index) => `${index + 1}. ${row.display_name} - ${row.points} pts`);
}

export function buildTournamentShareText(tournament: TournamentDetail) {
  const champion = tournament.leaderboard[0];
  const lines = [
    `${tournament.name} is finished.`,
    champion ? `Champion: ${champion.display_name}` : "",
    ...topThreeLines(tournament)
  ].filter(Boolean);
  return lines.join("\n");
}

export function openTournamentWhatsAppShare(tournament: TournamentDetail) {
  const text = encodeURIComponent(buildTournamentShareText(tournament));
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
}

export function downloadTournamentShareImage(tournament: TournamentDetail) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1500;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  context.fillStyle = "#0d161b";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 70; index += 1) {
    context.fillStyle = `hsla(${35 + (index * 7) % 40} 90% 65% / 0.18)`;
    context.beginPath();
    context.arc(70 + ((index * 131) % 1060), 80 + ((index * 97) % 1320), 4 + (index % 4), 0, Math.PI * 2);
    context.fill();
  }

  const champion = tournament.leaderboard[0];
  const podium = tournament.leaderboard.slice(0, 3);

  context.fillStyle = "#ffc980";
  context.font = "bold 34px Cascadia Code, monospace";
  context.fillText("Padel tournament", 80, 100);

  context.fillStyle = "#f8f1e7";
  context.font = "bold 64px Cascadia Code, monospace";
  context.fillText(tournament.name, 80, 190);

  context.fillStyle = "rgba(248, 241, 231, 0.72)";
  context.font = "32px Cascadia Code, monospace";
  context.fillText(`Format: ${tournament.format.toUpperCase()}`, 80, 250);

  context.fillStyle = "rgba(255, 179, 71, 0.18)";
  context.fillRect(80, 320, 1040, 260);
  context.fillStyle = "#f8f1e7";
  context.font = "bold 38px Cascadia Code, monospace";
  context.fillText("Champion", 120, 390);
  context.font = "bold 72px Cascadia Code, monospace";
  context.fillText(champion?.display_name ?? "Pending", 120, 485);
  context.font = "32px Cascadia Code, monospace";
  context.fillStyle = "#ffd79e";
  context.fillText(champion ? `${champion.points} pts | ${champion.wins}W ${champion.losses}L` : "No score yet", 120, 540);

  context.fillStyle = "#f8f1e7";
  context.font = "bold 38px Cascadia Code, monospace";
  context.fillText("Podium", 80, 700);

  podium.forEach((row, index) => {
    const top = 760 + index * 180;
    context.fillStyle = ["rgba(255, 179, 71, 0.16)", "rgba(197, 220, 255, 0.12)", "rgba(255, 168, 124, 0.12)"][index] ?? "rgba(255,255,255,0.04)";
    context.fillRect(80, top, 1040, 120);
    context.fillStyle = "#f8f1e7";
    context.font = "bold 40px Cascadia Code, monospace";
    context.fillText(`${index + 1}. ${row.display_name}`, 120, top + 52);
    context.fillStyle = "rgba(248, 241, 231, 0.72)";
    context.font = "30px Cascadia Code, monospace";
    context.fillText(`${row.points} pts | diff ${row.game_diff} | ${row.wins}W ${row.losses}L`, 120, top + 92);
  });

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `${tournament.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "tournament"}-podium.png`;
  link.click();
}
