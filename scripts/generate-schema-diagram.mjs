import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "docs/database-schema.png");
const width = 4800;
const height = 4000;

const colours = {
  users: { line: "#4f83f1", head: "#dbeafe" },
  season: { line: "#27ae72", head: "#dcfce7" },
  scoring: { line: "#f47a31", head: "#ffedd5" },
  system: { line: "#8b5cf6", head: "#f3e8ff" },
};

const panels = [
  { x: 70, title: "Users, groups & prizes" },
  { x: 1252, title: "Teams & season markets" },
  { x: 2434, title: "Fixtures, scoring & Golden Boot" },
  { x: 3616, title: "Provider, AI & configuration" },
];
const panelWidth = 1114;
const cardWidth = 994;

const cards = [
  { id: "auth", group: "users", panel: 0, y: 380, h: 210, title: "auth.users", lines: ["PK  id : uuid", "Supabase Auth identity"] },
  { id: "profiles", group: "users", panel: 0, y: 650, h: 420, title: "profiles", lines: ["PK/FK  id → auth.users.id", "UK  display_name", "FK  favorite_team_id → teams.id", "avatar_url, locale", "nickname_confirmed_at", "accepted_terms_at/version", "created_at, updated_at"] },
  { id: "groups", group: "users", panel: 0, y: 1130, h: 480, title: "groups", lines: ["PK  id : uuid", "FK  created_by → auth.users.id", "UK  invite_code", "name, image_url", "entry_fee_agorot", "prize_distribution[] totals 100%", "Bit/PayBox links, payment_note", "created_at"] },
  { id: "members", group: "users", panel: 0, y: 1670, h: 300, title: "group_members", lines: ["PK/FK  group_id → groups.id", "PK/FK  user_id → auth.users.id", "role, joined_at"] },
  { id: "requests", group: "users", panel: 0, y: 2030, h: 370, title: "group_join_requests", lines: ["PK  id : uuid", "FK  group_id → groups.id", "FK  user_id → auth.users.id", "FK  reviewed_by → auth.users.id", "UK  (group_id, user_id)", "status, requested/reviewed_at"] },

  { id: "teams", group: "season", panel: 1, y: 380, h: 320, title: "teams", lines: ["PK  id : uuid", "UK  provider IDs", "name, code, country, logo", "venue metadata, timestamps"] },
  { id: "team_candidates", group: "season", panel: 1, y: 760, h: 360, title: "season_team_candidates", lines: ["PK  (season, candidate_id)", "FK  team_id → teams.id", "provider/name/rank keys", "localized names, logo", "implied_probability", "pick_points, rank"] },
  { id: "player_candidates", group: "season", panel: 1, y: 1180, h: 420, title: "season_player_candidates", lines: ["PK  (season, candidate_id)", "FK  team_id → teams.id", "football_data_id", "localized player/team names", "photo, position, source stats", "implied_probability", "pick_points, rank"] },
  { id: "season_picks", group: "season", panel: 1, y: 1660, h: 410, title: "season_picks", lines: ["PK  id : uuid", "FK  user_id → auth.users.id", "FK  season/champion candidate", "FK  season/scorer candidate", "UK  (user_id, season)", "snapshotted pick/award points", "settled_at, created_at"] },
  { id: "ai_season", group: "season", panel: 1, y: 2130, h: 300, title: "ai_season_picks", lines: ["PK  season", "FK  champion_candidate_id", "FK  top_scorer_candidate_id", "snapshotted pick points"] },
  { id: "outcomes", group: "season", panel: 1, y: 2490, h: 280, title: "season_outcomes", lines: ["PK  season", "FK  champion_team_id → teams.id", "top_scorer provider IDs", "released_at, timestamps"] },
  { id: "squad", group: "season", panel: 1, y: 2830, h: 360, title: "team_squad_players", lines: ["PK  season/team/source/player", "FK  team_id → teams.id", "provider ID, name, position", "shirt, nationality, birth date", "photo, source, timestamps"] },

  { id: "fixtures", group: "scoring", panel: 2, y: 380, h: 540, title: "fixtures", lines: ["PK  id : uuid", "UK  provider IDs", "FK  home_team_id → teams.id", "FK  away_team_id → teams.id", "season, stage, round, matchday", "kickoff/original kickoff, status", "score, elapsed, venue/referee", "odds/probabilities", "outcome points, timestamps"] },
  { id: "predictions", group: "scoring", panel: 2, y: 980, h: 390, title: "predictions", lines: ["PK  id : uuid", "FK  user_id → auth.users.id", "FK  fixture_id → fixtures.id", "UK  (user_id, fixture_id)", "home/away goals, fixture_round", "is_joker, is_automatic, timestamps"] },
  { id: "scores", group: "scoring", panel: 2, y: 1430, h: 470, title: "prediction_scores", lines: ["PK/FK  prediction_id → predictions.id", "FK  user_id → auth.users.id", "FK  fixture_id → fixtures.id", "UK  (user_id, fixture_id)", "base/total points", "correct outcome/difference/exact", "difficulty/stage/joker multipliers", "breakdown, settled_at"] },
  { id: "scorers", group: "scoring", panel: 2, y: 1960, h: 390, title: "competition_scorers", lines: ["PK  (season, football_data_id)", "FK  team_id → teams.id", "name, position", "goals, assists", "photo_url, timestamps", "complete feed; candidate is optional"] },
  { id: "results", group: "scoring", panel: 2, y: 2410, h: 360, title: "fixture_results", lines: ["PK/FK  fixture_id → fixtures.id", "status, regulation score", "extra time, elapsed minutes", "released_at", "created_at, updated_at"] },

  { id: "ai_match", group: "system", panel: 3, y: 380, h: 410, title: "ai_match_predictions", lines: ["PK/FK  fixture_id → fixtures.id", "predicted score + probabilities", "confidence, bilingual summary/factors", "sources, model, source_snapshot", "generated_at"] },
  { id: "recent", group: "system", panel: 3, y: 850, h: 300, title: "fixture_recent_form", lines: ["PK/FK  fixture_id → fixtures.id", "home/away matches", "home/away lineup, fetched_at"] },
  { id: "details", group: "system", panel: 3, y: 1210, h: 300, title: "fixture_details", lines: ["PK/FK  fixture_id → fixtures.id", "provider_status, payload", "fetched_at"] },
  { id: "usage", group: "system", panel: 3, y: 1570, h: 390, title: "ai_prediction_usage", lines: ["PK  id : uuid", "FK  fixture_id → fixtures.id", "model, budget/estimated cost", "input/cache-write/output tokens", "web searches, status, timestamps"] },
  { id: "poll", group: "system", panel: 3, y: 2020, h: 250, title: "provider_poll_state", lines: ["PK  job : text", "last_requested_at"] },
  { id: "automation", group: "system", panel: 3, y: 2330, h: 270, title: "prediction_automation_config", lines: ["PK  id : smallint singleton", "enabled_at"] },
  { id: "settings", group: "system", panel: 3, y: 2660, h: 360, title: "game_settings", lines: ["PK  id : smallint singleton", "FK  updated_by → auth.users.id", "exact/outcome points", "bilingual rules notes", "AI player name/avatar, updated_at"] },
];

const byId = new Map(cards.map((card) => [card.id, card]));
const cardX = (card) => panels[card.panel].x + 60;
const anchor = (id, side = "right", offset = 0) => {
  const card = byId.get(id);
  return {
    x: cardX(card) + (side === "right" ? cardWidth : 0),
    y: card.y + card.h / 2 + offset,
  };
};

const relations = [
  ["auth", "profiles", "users"], ["auth", "groups", "users"], ["groups", "members", "users"], ["groups", "requests", "users"],
  ["teams", "team_candidates", "season"], ["teams", "player_candidates", "season"], ["team_candidates", "season_picks", "season"], ["player_candidates", "season_picks", "season"],
  ["team_candidates", "ai_season", "season"], ["player_candidates", "ai_season", "season"], ["teams", "outcomes", "season"], ["teams", "squad", "season"],
  ["fixtures", "predictions", "scoring"], ["predictions", "scores", "scoring"], ["fixtures", "results", "scoring"],
  ["fixtures", "ai_match", "system"], ["fixtures", "recent", "system"], ["fixtures", "details", "system"], ["fixtures", "usage", "system"],
];

const esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function relation([fromId, toId, group]) {
  const fromCard = byId.get(fromId);
  const toCard = byId.get(toId);
  const samePanel = fromCard.panel === toCard.panel;
  const start = anchor(fromId, samePanel ? "left" : "right");
  const end = anchor(toId, samePanel ? "left" : "left");
  const bend = samePanel ? Math.min(start.x, end.x) - 32 : (start.x + end.x) / 2;
  return `<path d="M ${start.x} ${start.y} C ${bend} ${start.y}, ${bend} ${end.y}, ${end.x} ${end.y}" fill="none" stroke="${colours[group].line}" stroke-width="5" opacity=".58" marker-end="url(#arrow-${group})"/>`;
}

function cardMarkup(card) {
  const x = cardX(card);
  const palette = colours[card.group];
  const lines = card.lines.map((line, index) => {
    const key = /^(PK|FK|UK)/.test(line);
    return `<text x="${x + 34}" y="${card.y + 118 + index * 38}" class="body" fill="${key ? palette.line : "#40516a"}">${esc(line)}</text>`;
  }).join("");
  return `<g filter="url(#shadow)">
    <rect x="${x}" y="${card.y}" width="${cardWidth}" height="${card.h}" rx="24" fill="#ffffff" stroke="#91a4bb" stroke-width="4"/>
    <path d="M ${x + 24} ${card.y} H ${x + cardWidth - 24} Q ${x + cardWidth} ${card.y} ${x + cardWidth} ${card.y + 24} V ${card.y + 72} H ${x} V ${card.y + 24} Q ${x} ${card.y} ${x + 24} ${card.y}" fill="${palette.head}"/>
    <text x="${x + 34}" y="${card.y + 49}" class="table-title">${esc(card.title)}</text>
    ${lines}
  </g>`;
}

const markers = Object.entries(colours).map(([name, palette]) => `<marker id="arrow-${name}" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M 0 0 L 12 6 L 0 12 z" fill="${palette.line}"/></marker>`).join("");
const panelMarkup = panels.map((panel) => `<rect x="${panel.x}" y="235" width="${panelWidth}" height="3500" rx="34" fill="#ffffff" stroke="#cbd8e7" stroke-width="4"/><text x="${panel.x + 50}" y="320" class="panel-title">${esc(panel.title)}</text>`).join("");

const legend = Object.entries({ users: "Auth / group relation", season: "Team / season relation", scoring: "Fixture / scoring relation", system: "Provider / AI relation" }).map(([group, label], index) => {
  const x = 130 + index * 740;
  return `<line x1="${x}" y1="3810" x2="${x + 100}" y2="3810" stroke="${colours[group].line}" stroke-width="6" marker-end="url(#arrow-${group})"/><text x="${x + 132}" y="3823" class="legend">${label}</text>`;
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0f2744" flood-opacity=".16"/></filter>
    ${markers}
    <style>
      .title { font: 800 68px Inter, Arial, sans-serif; fill: #142033; letter-spacing: -1px; }
      .subtitle { font: 32px Inter, Arial, sans-serif; fill: #71829a; }
      .panel-title { font: 700 43px Inter, Arial, sans-serif; fill: #31445e; }
      .table-title { font: 700 33px Consolas, "Courier New", monospace; fill: #1f2e43; }
      .body { font: 27px Consolas, "Courier New", monospace; }
      .legend { font: 26px Inter, Arial, sans-serif; fill: #52657d; }
    </style>
  </defs>
  <rect width="${width}" height="${height}" fill="#f5f8fc"/>
  <text x="100" y="112" class="title">ChampionsLeague — Database Class Diagram</text>
  <text x="100" y="176" class="subtitle">PK = primary key · FK = foreign key · UK = unique key · arrows run from parent to dependent table</text>
  ${panelMarkup}
  <g>${relations.map(relation).join("")}</g>
  <g>${cards.map(cardMarkup).join("")}</g>
  ${legend}
  <text x="3220" y="3823" class="legend">23 public tables · RLS enabled · source: supabase/migrations/0001_init.sql</text>
</svg>`;

await writeFile(resolve(root, "docs/database-schema.svg"), svg, "utf8");
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);
console.log(`Wrote ${output}`);
