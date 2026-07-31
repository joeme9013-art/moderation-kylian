require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, SlashCommandBuilder, REST, Routes,
} = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const GUILD_ID = '1324059331406069872';
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { teams: {}, coins: {}, lastDaily: {}, boosts: {}, players: {}, tournament: null };
  }
  const p = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  p.teams ??= {}; p.coins ??= {}; p.lastDaily ??= {}; p.boosts ??= {}; p.players ??= {}; p.tournament ??= null;
  return p;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

function cdnFlag(code) { return `https://flagcdn.com/w320/${code}.png`; }
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// COUNTRIES (every UN member + Vatican + Palestine + home nations)
// ============================================================
const COUNTRIES = [
  { name: 'Algeria', code: 'dz' }, { name: 'Angola', code: 'ao' }, { name: 'Benin', code: 'bj' },
  { name: 'Botswana', code: 'bw' }, { name: 'Burkina Faso', code: 'bf' }, { name: 'Burundi', code: 'bi' },
  { name: 'Cabo Verde', code: 'cv' }, { name: 'Cameroon', code: 'cm' }, { name: 'Central African Republic', code: 'cf' },
  { name: 'Chad', code: 'td' }, { name: 'Comoros', code: 'km' }, { name: 'Congo', code: 'cg' },
  { name: 'DR Congo', code: 'cd' }, { name: 'Djibouti', code: 'dj' }, { name: 'Egypt', code: 'eg' },
  { name: 'Equatorial Guinea', code: 'gq' }, { name: 'Eritrea', code: 'er' }, { name: 'Eswatini', code: 'sz' },
  { name: 'Ethiopia', code: 'et' }, { name: 'Gabon', code: 'ga' }, { name: 'Gambia', code: 'gm' },
  { name: 'Ghana', code: 'gh' }, { name: 'Guinea', code: 'gn' }, { name: 'Guinea-Bissau', code: 'gw' },
  { name: 'Ivory Coast', code: 'ci' }, { name: 'Kenya', code: 'ke' }, { name: 'Lesotho', code: 'ls' },
  { name: 'Liberia', code: 'lr' }, { name: 'Libya', code: 'ly' }, { name: 'Madagascar', code: 'mg' },
  { name: 'Malawi', code: 'mw' }, { name: 'Mali', code: 'ml' }, { name: 'Mauritania', code: 'mr' },
  { name: 'Mauritius', code: 'mu' }, { name: 'Morocco', code: 'ma' }, { name: 'Mozambique', code: 'mz' },
  { name: 'Namibia', code: 'na' }, { name: 'Niger', code: 'ne' }, { name: 'Nigeria', code: 'ng' },
  { name: 'Rwanda', code: 'rw' }, { name: 'Sao Tome and Principe', code: 'st' }, { name: 'Senegal', code: 'sn' },
  { name: 'Seychelles', code: 'sc' }, { name: 'Sierra Leone', code: 'sl' }, { name: 'Somalia', code: 'so' },
  { name: 'South Africa', code: 'za' }, { name: 'South Sudan', code: 'ss' }, { name: 'Sudan', code: 'sd' },
  { name: 'Tanzania', code: 'tz' }, { name: 'Togo', code: 'tg' }, { name: 'Tunisia', code: 'tn' },
  { name: 'Uganda', code: 'ug' }, { name: 'Zambia', code: 'zm' }, { name: 'Zimbabwe', code: 'zw' },
  { name: 'Antigua and Barbuda', code: 'ag' }, { name: 'Argentina', code: 'ar' }, { name: 'Bahamas', code: 'bs' },
  { name: 'Barbados', code: 'bb' }, { name: 'Belize', code: 'bz' }, { name: 'Bolivia', code: 'bo' },
  { name: 'Brazil', code: 'br' }, { name: 'Canada', code: 'ca' }, { name: 'Chile', code: 'cl' },
  { name: 'Colombia', code: 'co' }, { name: 'Costa Rica', code: 'cr' }, { name: 'Cuba', code: 'cu' },
  { name: 'Dominica', code: 'dm' }, { name: 'Dominican Republic', code: 'do' }, { name: 'Ecuador', code: 'ec' },
  { name: 'El Salvador', code: 'sv' }, { name: 'Grenada', code: 'gd' }, { name: 'Guatemala', code: 'gt' },
  { name: 'Guyana', code: 'gy' }, { name: 'Haiti', code: 'ht' }, { name: 'Honduras', code: 'hn' },
  { name: 'Jamaica', code: 'jm' }, { name: 'Mexico', code: 'mx' }, { name: 'Nicaragua', code: 'ni' },
  { name: 'Panama', code: 'pa' }, { name: 'Paraguay', code: 'py' }, { name: 'Peru', code: 'pe' },
  { name: 'Saint Kitts and Nevis', code: 'kn' }, { name: 'Saint Lucia', code: 'lc' },
  { name: 'Saint Vincent and the Grenadines', code: 'vc' }, { name: 'Suriname', code: 'sr' },
  { name: 'Trinidad and Tobago', code: 'tt' }, { name: 'USA', code: 'us' }, { name: 'Uruguay', code: 'uy' },
  { name: 'Venezuela', code: 've' },
  { name: 'Afghanistan', code: 'af' }, { name: 'Bahrain', code: 'bh' }, { name: 'Bangladesh', code: 'bd' },
  { name: 'Bhutan', code: 'bt' }, { name: 'Brunei', code: 'bn' }, { name: 'Cambodia', code: 'kh' },
  { name: 'China', code: 'cn' }, { name: 'Georgia', code: 'ge' }, { name: 'India', code: 'in' },
  { name: 'Indonesia', code: 'id' }, { name: 'Iran', code: 'ir' }, { name: 'Iraq', code: 'iq' },
  { name: 'Israel', code: 'il' }, { name: 'Japan', code: 'jp' }, { name: 'Jordan', code: 'jo' },
  { name: 'Kazakhstan', code: 'kz' }, { name: 'Kuwait', code: 'kw' }, { name: 'Kyrgyzstan', code: 'kg' },
  { name: 'Laos', code: 'la' }, { name: 'Lebanon', code: 'lb' }, { name: 'Malaysia', code: 'my' },
  { name: 'Maldives', code: 'mv' }, { name: 'Mongolia', code: 'mn' }, { name: 'Myanmar', code: 'mm' },
  { name: 'Nepal', code: 'np' }, { name: 'North Korea', code: 'kp' }, { name: 'Oman', code: 'om' },
  { name: 'Pakistan', code: 'pk' }, { name: 'Philippines', code: 'ph' }, { name: 'Qatar', code: 'qa' },
  { name: 'Saudi Arabia', code: 'sa' }, { name: 'Singapore', code: 'sg' }, { name: 'South Korea', code: 'kr' },
  { name: 'Sri Lanka', code: 'lk' }, { name: 'Syria', code: 'sy' }, { name: 'Tajikistan', code: 'tj' },
  { name: 'Thailand', code: 'th' }, { name: 'Timor-Leste', code: 'tl' }, { name: 'Turkey', code: 'tr' },
  { name: 'Turkmenistan', code: 'tm' }, { name: 'United Arab Emirates', code: 'ae' }, { name: 'Uzbekistan', code: 'uz' },
  { name: 'Vietnam', code: 'vn' }, { name: 'Yemen', code: 'ye' }, { name: 'Palestine', code: 'ps' },
  { name: 'Albania', code: 'al' }, { name: 'Andorra', code: 'ad' }, { name: 'Austria', code: 'at' },
  { name: 'Belarus', code: 'by' }, { name: 'Belgium', code: 'be' }, { name: 'Bosnia and Herzegovina', code: 'ba' },
  { name: 'Bulgaria', code: 'bg' }, { name: 'Croatia', code: 'hr' }, { name: 'Cyprus', code: 'cy' },
  { name: 'Czechia', code: 'cz' }, { name: 'Denmark', code: 'dk' }, { name: 'Estonia', code: 'ee' },
  { name: 'Finland', code: 'fi' }, { name: 'France', code: 'fr' }, { name: 'Germany', code: 'de' },
  { name: 'Greece', code: 'gr' }, { name: 'Hungary', code: 'hu' }, { name: 'Iceland', code: 'is' },
  { name: 'Ireland', code: 'ie' }, { name: 'Italy', code: 'it' }, { name: 'Latvia', code: 'lv' },
  { name: 'Liechtenstein', code: 'li' }, { name: 'Lithuania', code: 'lt' }, { name: 'Luxembourg', code: 'lu' },
  { name: 'Malta', code: 'mt' }, { name: 'Moldova', code: 'md' }, { name: 'Monaco', code: 'mc' },
  { name: 'Montenegro', code: 'me' }, { name: 'Netherlands', code: 'nl' }, { name: 'North Macedonia', code: 'mk' },
  { name: 'Norway', code: 'no' }, { name: 'Poland', code: 'pl' }, { name: 'Portugal', code: 'pt' },
  { name: 'Romania', code: 'ro' }, { name: 'Russia', code: 'ru' }, { name: 'San Marino', code: 'sm' },
  { name: 'Serbia', code: 'rs' }, { name: 'Slovakia', code: 'sk' }, { name: 'Slovenia', code: 'si' },
  { name: 'Spain', code: 'es' }, { name: 'Sweden', code: 'se' }, { name: 'Switzerland', code: 'ch' },
  { name: 'Ukraine', code: 'ua' }, { name: 'United Kingdom', code: 'gb' }, { name: 'Vatican City', code: 'va' },
  { name: 'England', code: 'gb-eng' }, { name: 'Scotland', code: 'gb-sct' }, { name: 'Wales', code: 'gb-wls' },
  { name: 'Australia', code: 'au' }, { name: 'Fiji', code: 'fj' }, { name: 'Kiribati', code: 'ki' },
  { name: 'Marshall Islands', code: 'mh' }, { name: 'Micronesia', code: 'fm' }, { name: 'Nauru', code: 'nr' },
  { name: 'New Zealand', code: 'nz' }, { name: 'Palau', code: 'pw' }, { name: 'Papua New Guinea', code: 'pg' },
  { name: 'Samoa', code: 'ws' }, { name: 'Solomon Islands', code: 'sb' }, { name: 'Tonga', code: 'to' },
  { name: 'Tuvalu', code: 'tv' }, { name: 'Vanuatu', code: 'vu' },
];

// ---------- Team / player helpers ----------
function getTeam(userId) { return data.teams[userId] || null; }
function getCoins(userId) { return data.coins[userId] || 0; }
function addCoins(userId, amount) { data.coins[userId] = Math.max(0, (data.coins[userId] || 0) + amount); }
function getBoosts(userId) { data.boosts[userId] = data.boosts[userId] || {}; return data.boosts[userId]; }
function getSquadPlayers(userId) {
  const team = getTeam(userId);
  if (!team?.squad) return [];
  return team.squad.map((id) => data.players[id]).filter(Boolean);
}
function makePlayerId(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
}

// ============================================================
// MATCH ENGINE — goal generation, scorer commentary, animation
// ============================================================
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
function baseGoalCount() { return GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)]; }

function applyBoostsToGoals(userId, goals) {
  const boosts = getBoosts(userId);
  let result = goals;
  if (boosts.starStriker) { result += 1; delete boosts.starStriker; }
  if (boosts.luckyCharm) { result += 1; delete boosts.luckyCharm; }
  return result;
}
function applyOpponentReduction(userId, goals) {
  const boosts = getBoosts(userId);
  let result = goals;
  if (boosts.ironWall) { result = Math.max(0, result - 1); delete boosts.ironWall; }
  return result;
}

function pickScorer(squadPlayers, teamName) {
  const outfield = squadPlayers.filter((p) => p.position !== 'GK');
  const pool = outfield.length ? outfield : squadPlayers;
  if (pool.length === 0) return `A ${teamName} player`;
  return pool[Math.floor(Math.random() * pool.length)].name;
}
function pickGoalkeeper(squadPlayers, teamName) {
  const gk = squadPlayers.find((p) => p.position === 'GK');
  return gk ? gk.name : `The ${teamName} keeper`;
}

function generateGoalEvents(goalCount, squadPlayers, teamName, side) {
  const events = [];
  for (let i = 0; i < goalCount; i++) {
    const isPenalty = Math.random() < 0.12;
    const isStoppage = Math.random() < 0.15;
    const minute = isStoppage ? 90 + Math.floor(Math.random() * 8) + 1 : Math.floor(Math.random() * 90) + 1;
    events.push({ minute, side, type: 'goal', player: pickScorer(squadPlayers, teamName), isPenalty });
  }
  return events;
}
function generateFlavorEvents(squadA, squadB, teamAName, teamBName) {
  const events = [];
  const flavorCount = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < flavorCount; i++) {
    const minute = Math.floor(Math.random() * 90) + 1;
    const side = Math.random() < 0.5 ? 'A' : 'B';
    const squad = side === 'A' ? squadA : squadB;
    const teamName = side === 'A' ? teamAName : teamBName;
    const oppSquad = side === 'A' ? squadB : squadA;
    const oppTeamName = side === 'A' ? teamBName : teamAName;
    const roll = Math.random();
    if (roll < 0.5) {
      events.push({ minute, side, type: 'save', player: pickScorer(squad, teamName), gk: pickGoalkeeper(oppSquad, oppTeamName) });
    } else {
      events.push({ minute, side, type: 'card', player: pickScorer(squad, teamName), card: Math.random() < 0.15 ? 'red' : 'yellow' });
    }
  }
  return events;
}

function formatMinute(minute) {
  if (minute > 90) return `90+${minute - 90}'`;
  return `${minute}'`;
}
function commentaryLine(ev) {
  const minStr = formatMinute(ev.minute);
  if (ev.type === 'goal') {
    return `⚽ ${minStr} — **${ev.player}** rushes through, dribbles past the defense and SCORES${ev.isPenalty ? ' from the spot' : ''}!`;
  }
  if (ev.type === 'save') {
    return `🧤 ${minStr} — **${ev.player}** shoots... but it's saved brilliantly by **${ev.gk}**!`;
  }
  return `${ev.card === 'red' ? '🟥' : '🟨'} ${minStr} — **${ev.player}** is shown a ${ev.card} card.`;
}

// Groups scorers by player for the final result screen, e.g. "K. Mbappé 48', 66'"
function formatScorerList(goalEvents) {
  const byPlayer = {};
  for (const ev of goalEvents) {
    byPlayer[ev.player] = byPlayer[ev.player] || [];
    byPlayer[ev.player].push(`${formatMinute(ev.minute)}${ev.isPenalty ? ' (P)' : ''}`);
  }
  const lines = Object.entries(byPlayer).map(([player, mins]) => `${player} ${mins.join(', ')}`);
  return lines.length ? lines.join('\n') : '—';
}

async function playMatch(channel, teamAId, teamBId, roundLabel) {
  const teamA = getTeam(teamAId), teamB = getTeam(teamBId);
  const squadA = getSquadPlayers(teamAId), squadB = getSquadPlayers(teamBId);

  let goalsA = applyBoostsToGoals(teamAId, baseGoalCount());
  let goalsB = applyBoostsToGoals(teamBId, baseGoalCount());
  goalsA = applyOpponentReduction(teamBId, goalsA); // teamB's ironWall reduces teamA's goals
  goalsB = applyOpponentReduction(teamAId, goalsB);

  const goalEventsA = generateGoalEvents(goalsA, squadA, teamA.name, 'A');
  const goalEventsB = generateGoalEvents(goalsB, squadB, teamB.name, 'B');
  const flavorEvents = generateFlavorEvents(squadA, squadB, teamA.name, teamB.name);
  const allEvents = [...goalEventsA, ...goalEventsB, ...flavorEvents].sort((a, b) => a.minute - b.minute);

  await channel.send({
    embeds: [new EmbedBuilder().setTitle(`⚽ ${roundLabel}: Kickoff!`)
      .setDescription(`**${teamA.name}** vs **${teamB.name}**`)
      .setThumbnail(cdnFlag(teamA.code)).setColor(0x2ecc71)],
  });

  let runningA = 0, runningB = 0;
  for (const ev of allEvents) {
    await delay(2500);
    if (ev.type === 'goal') { if (ev.side === 'A') runningA++; else runningB++; }
    let line = commentaryLine(ev);
    if (ev.type === 'goal') line += `\n**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**`;
    await channel.send(line);
  }
  await delay(1500);

  let penalties = null;
  let winnerId;
  if (goalsA === goalsB) {
    let penA = 0, penB = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.75) penA++; if (Math.random() < 0.75) penB++; }
    while (penA === penB) { if (Math.random() < 0.5) penA++; else penB++; }
    penalties = { penA, penB };
    winnerId = penA > penB ? teamAId : teamBId;
  } else {
    winnerId = goalsA > goalsB ? teamAId : teamBId;
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle(roundLabel)
    .setAuthor({ name: teamA.name, iconURL: cdnFlag(teamA.code) })
    .setThumbnail(cdnFlag(teamB.code))
    .setDescription(
      `**${teamA.name}**  ${goalsA} - ${goalsB}  **${teamB.name}**\n` +
      `🏁 Full-Time${penalties ? ` (pens: ${penalties.penA}-${penalties.penB})` : ''} • <t:${Math.floor(Date.now() / 1000)}:d>`
    )
    .addFields(
      { name: `${teamA.name} Scorers`, value: formatScorerList(goalEventsA), inline: true },
      { name: `${teamB.name} Scorers`, value: formatScorerList(goalEventsB), inline: true },
    )
    .setColor(0x2ecc71);
  await channel.send({ embeds: [resultEmbed] });

  const loserId = winnerId === teamAId ? teamBId : teamAId;
  getTeam(winnerId).wins += 1;
  getTeam(loserId).losses += 1;
  addCoins(winnerId, 25);
  saveData(data);

  return { goalsA, goalsB, penalties, winnerId };
}

// ============================================================
// INSTANT (unanimated) MATCH — used for group-stage fixtures, so a
// full group phase doesn't take forever to play through
// ============================================================
function simulateMatchInstant(teamAId, teamBId) {
  let goalsA = applyBoostsToGoals(teamAId, baseGoalCount());
  let goalsB = applyBoostsToGoals(teamBId, baseGoalCount());
  goalsA = applyOpponentReduction(teamBId, goalsA);
  goalsB = applyOpponentReduction(teamAId, goalsB);
  return { goalsA, goalsB };
}

// ============================================================
// TOURNAMENT — group stage (optional) + knockout bracket
// ============================================================
function roundNameForSize(size) {
  if (size >= 32) return 'Round of 32';
  if (size === 16) return 'Round of 16';
  if (size === 8) return 'Quarterfinals';
  if (size === 4) return 'Semifinals';
  if (size === 2) return 'Final';
  return `Round of ${size}`;
}
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function buildKnockoutRound(participants) {
  const shuffled = shuffle(participants);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) matches.push({ p1: shuffled[i], p2: shuffled[i + 1], winner: null, result: null });
  return matches;
}
function tournamentDisplayName(t) {
  if (t.type === 'worldcup') return `FIFA World Cup ${new Date().getFullYear()}™`;
  if (t.type === 'championsleague') return 'UEFA Champions League';
  return t.name;
}
async function getTournamentChannel(guild) {
  const t = data.tournament;
  if (!t?.channelId) return null;
  return guild.channels.cache.get(t.channelId) || await guild.channels.fetch(t.channelId).catch(() => null);
}

function buildRoundRobin(group) {
  const matches = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) matches.push({ p1: group[i], p2: group[j], played: false, goalsA: null, goalsB: null });
  }
  return matches;
}
function groupStandings(group, matches) {
  const table = {};
  for (const id of group) table[id] = { id, pts: 0, gf: 0, ga: 0, played: 0 };
  for (const m of matches) {
    if (!m.played) continue;
    table[m.p1].played++; table[m.p2].played++;
    table[m.p1].gf += m.goalsA; table[m.p1].ga += m.goalsB;
    table[m.p2].gf += m.goalsB; table[m.p2].ga += m.goalsA;
    if (m.goalsA > m.goalsB) table[m.p1].pts += 3;
    else if (m.goalsA < m.goalsB) table[m.p2].pts += 3;
    else { table[m.p1].pts += 1; table[m.p2].pts += 1; }
  }
  return Object.values(table).sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
}

async function startNextKnockoutMatch(guild) {
  const t = data.tournament;
  if (!t || t.status !== 'knockout') return;
  const round = t.rounds[t.rounds.length - 1];
  const idx = round.findIndex((m) => !m.winner);

  if (idx === -1) {
    const winners = round.map((m) => m.winner);
    if (winners.length === 1) { await crownChampion(guild, winners[0]); return; }
    t.rounds.push(buildKnockoutRound(winners));
    saveData(data);
    const channel = await getTournamentChannel(guild);
    if (channel) await channel.send({ embeds: [new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — ${roundNameForSize(winners.length)} begins!`).setColor(0x3498db)] });
    return startNextKnockoutMatch(guild);
  }

  const match = round[idx];
  const channel = await getTournamentChannel(guild);
  if (!channel) return;
  const result = await playMatch(channel, match.p1, match.p2, roundNameForSize(round.length * 2));
  match.winner = result.winnerId;
  match.result = result;
  saveData(data);
  await startNextKnockoutMatch(guild);
}

async function crownChampion(guild, championId) {
  const t = data.tournament;
  t.status = 'completed';
  t.champion = championId;
  const champTeam = getTeam(championId);
  champTeam.trophies += 1;
  addCoins(championId, 200);
  saveData(data);
  if (t.prizeRoleId) {
    const member = await guild.members.fetch(championId).catch(() => null);
    if (member) await member.roles.add(t.prizeRoleId).catch(() => {});
  }
  const channel = await getTournamentChannel(guild);
  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(`🏆🎉 ${champTeam.name} WINS ${tournamentDisplayName(t)}!`)
        .setDescription(`Prize: ${t.prize}\n+200 coins awarded.`).setThumbnail(cdnFlag(champTeam.code)).setColor(0xffd700)],
    });
  }
}

// ============================================================
// SLASH COMMANDS
// ============================================================
const sizeChoices = [
  { name: 'Round of 32 (32 teams)', value: '32' }, { name: 'Round of 16 (16 teams)', value: '16' },
  { name: 'Quarterfinals (8 teams)', value: '8' }, { name: 'Semifinals (4 teams)', value: '4' },
];
const typeChoices = [
  { name: 'FIFA World Cup', value: 'worldcup' }, { name: 'Champions League', value: 'championsleague' }, { name: 'Custom', value: 'custom' },
];
const positionChoices = [
  { name: 'Goalkeeper (GK)', value: 'GK' }, { name: 'Defender (DEF)', value: 'DEF' },
  { name: 'Midfielder (MID)', value: 'MID' }, { name: 'Forward (FWD)', value: 'FWD' },
];
const shopChoices = [
  { name: 'Star Striker — +1 guaranteed goal next match', value: 'starstriker' },
  { name: "Iron Wall — -1 opponent's goals next match", value: 'ironwall' },
  { name: 'Lucky Charm — +1 head-start goal next match', value: 'luckycharm' },
  { name: 'Double Daily — next /daily pays double', value: 'doubledaily' },
];

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),

  new SlashCommandBuilder().setName('team').setDescription('Manage your national team.')
    .addSubcommand((s) => s.setName('set').setDescription('Choose the country you represent.')
      .addStringOption((o) => o.setName('country').setDescription('Country name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('profile').setDescription("View a team's profile.")
      .addUserOption((o) => o.setName('user').setDescription('Whose profile').setRequired(false))),

  new SlashCommandBuilder().setName('createplayer').setDescription('Create a custom player.')
    .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true))
    .addStringOption((o) => o.setName('position').setDescription('Position').setRequired(true).addChoices(...positionChoices))
    .addIntegerOption((o) => o.setName('rating').setDescription('Rating 40-99 (default random 60-90)').setRequired(false).setMinValue(40).setMaxValue(99)),

  new SlashCommandBuilder().setName('player').setDescription('Squad management.')
    .addSubcommand((s) => s.setName('sign').setDescription('Sign a free-agent player to your squad (max 11).')
      .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('release').setDescription('Release a player from your squad back to free agency.')
      .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('squad').setDescription("View a team's squad.")
      .addUserOption((o) => o.setName('user').setDescription('Whose squad').setRequired(false)))
    .addSubcommand((s) => s.setName('list').setDescription('List free-agent players available to sign.')),

  new SlashCommandBuilder().setName('balance').setDescription('Check your coin balance.'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins.'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top players.')
    .addStringOption((o) => o.setName('type').setDescription('Rank by').setRequired(true)
      .addChoices({ name: 'coins', value: 'coins' }, { name: 'trophies', value: 'trophies' })),

  new SlashCommandBuilder().setName('matchsim').setDescription('Play a full animated friendly match against another team.')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to play').setRequired(true)),
  new SlashCommandBuilder().setName('penalty').setDescription('Take a 5-kick penalty shootout for coins.'),
  new SlashCommandBuilder().setName('var').setDescription('Call for a VAR review on your last result.'),
  new SlashCommandBuilder().setName('card').setDescription('Give someone a joke yellow or red card.')
    .addUserOption((o) => o.setName('user').setDescription('Who to card').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('The "offense"').setRequired(false)),
  new SlashCommandBuilder().setName('chant').setDescription("Generate your team's fan chant."),

  new SlashCommandBuilder().setName('shop').setDescription('Transfer market — spend coins on boosts.')
    .addSubcommand((s) => s.setName('view').setDescription('See what the market is selling.'))
    .addSubcommand((s) => s.setName('buy').setDescription('Buy an item.')
      .addStringOption((o) => o.setName('item').setDescription('Item to buy').setRequired(true).addChoices(...shopChoices))),

  new SlashCommandBuilder().setName('tournament').setDescription('Tournament commands.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new tournament. Admin only.')
      .addStringOption((o) => o.setName('type').setDescription('Tournament type').setRequired(true).addChoices(...typeChoices))
      .addStringOption((o) => o.setName('size').setDescription('Knockout bracket size').setRequired(true).addChoices(...sizeChoices))
      .addStringOption((o) => o.setName('prize').setDescription('Prize description').setRequired(true))
      .addStringOption((o) => o.setName('name').setDescription('Custom name (only used if type = Custom)').setRequired(false))
      .addRoleOption((o) => o.setName('prize_role').setDescription('Role to award the champion').setRequired(false)))
    .addSubcommand((s) => s.setName('join').setDescription('Join the open tournament.'))
    .addSubcommand((s) => s.setName('leave').setDescription('Leave the open tournament.'))
    .addSubcommand((s) => s.setName('creategroups').setDescription('Split registered teams into groups. Admin only.')
      .addIntegerOption((o) => o.setName('num_groups').setDescription('How many groups').setRequired(true).setMinValue(2).setMaxValue(8)))
    .addSubcommand((s) => s.setName('playgroups').setDescription('Simulate all remaining group-stage matches. Admin only.'))
    .addSubcommand((s) => s.setName('standings').setDescription('View group stage standings.'))
    .addSubcommand((s) => s.setName('advancegroups').setDescription('Advance top teams from groups into the knockout bracket. Admin only.')
      .addIntegerOption((o) => o.setName('top').setDescription('How many teams advance per group').setRequired(true).setMinValue(1).setMaxValue(4)))
    .addSubcommand((s) => s.setName('start').setDescription('Skip groups and start the knockout bracket directly. Admin only.'))
    .addSubcommand((s) => s.setName('bracket').setDescription('View the current knockout bracket.'))
    .addSubcommand((s) => s.setName('status').setDescription('View tournament status.'))
    .addSubcommand((s) => s.setName('end').setDescription('Cancel the current tournament. Admin only.')),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}
client.once('ready', async () => { console.log(`Logged in as ${client.user.tag}`); await registerCommands(); });

const SHOP_PRICES = { starstriker: 80, ironwall: 80, luckycharm: 120, doubledaily: 50 };
const DAILY_AMOUNT = 25;
const VAR_OUTCOMES = [
  '🟩 VAR confirms the original decision. No change.',
  '🟥 VAR overturns it! That result is getting reviewed by the panel.',
  '📺 VAR is taking a while... the referee is checking the monitor... decision stands.',
  '🎥 After a lengthy review, VAR sides with the referee. Play on.',
];
const CHANTS = [
  '🎶 Ohhh {team}, we love you! 🎶', '🎶 {team}, {team}, {team}! 🎶',
  '🎶 We are the {team}, the mighty mighty {team}! 🎶',
  '🎶 Que sera sera, whatever will be, {team} in the final, {team} in the final! 🎶',
  '🎶 Allez, allez, allez! {team} till we die! 🎶',
];
const CARD_QUOTES = { yellow: ['a reckless challenge', 'excessive celebrating', 'dissent', 'time-wasting'], red: ['a two-footed lunge', 'violent conduct', 'denying a clear goalscoring opportunity'] };

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (interaction.commandName === 'team' && focused.name === 'country') {
        const q = focused.value.toLowerCase();
        await interaction.respond(COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.code })));
        return;
      }
      if (interaction.commandName === 'player' && focused.name === 'name') {
        const q = focused.value.toLowerCase();
        const sub = interaction.options.getSubcommand();
        let pool;
        if (sub === 'sign') pool = Object.values(data.players).filter((p) => !p.ownerId);
        else pool = getSquadPlayers(interaction.user.id);
        const matches = pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 25).map((p) => ({ name: `${p.name} (${p.position}, ${p.rating})`, value: p.name }));
        await interaction.respond(matches);
        return;
      }
      await interaction.respond([]);
      return;
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    const name = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);

    if (name === 'help') {
      await interaction.reply({
        ephemeral: true,
        content: '```\n' +
          'COMMANDS:\n' +
          '/team set, /team profile\n' +
          '/createplayer, /player sign/release/squad/list\n' +
          '/balance, /daily, /leaderboard\n' +
          '/matchsim (full animated friendly), /penalty\n' +
          '/var, /card, /chant\n' +
          '/shop view, /shop buy\n' +
          '/tournament create/join/leave/creategroups/playgroups/\n' +
          '            standings/advancegroups/start/bracket/status/end\n' +
          '```',
      });
      return;
    }

    if (name === 'team') {
      if (sub === 'set') {
        const code = interaction.options.getString('country');
        const country = COUNTRIES.find((c) => c.code === code);
        if (!country) { await interaction.reply({ content: 'Pick a country from the list.', ephemeral: true }); return; }
        data.teams[interaction.user.id] = { ...(data.teams[interaction.user.id] || { wins: 0, losses: 0, trophies: 0, squad: [] }), code: country.code, name: country.name };
        saveData(data);
        await interaction.reply({ content: `✅ You now represent **${country.name}**!`, embeds: [new EmbedBuilder().setThumbnail(cdnFlag(country.code)).setColor(0x2ecc71)] });
        return;
      }
      if (sub === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const team = getTeam(target.id);
        if (!team) { await interaction.reply(`${target.username} hasn't picked a team yet — use /team set.`); return; }
        const embed = new EmbedBuilder().setTitle(`${team.name} — ${target.username}`).setThumbnail(cdnFlag(team.code))
          .addFields(
            { name: 'Wins', value: `${team.wins}`, inline: true }, { name: 'Losses', value: `${team.losses}`, inline: true },
            { name: '🏆 Trophies', value: `${team.trophies}`, inline: true }, { name: '💰 Coins', value: `${getCoins(target.id)}`, inline: true },
            { name: 'Squad Size', value: `${(team.squad || []).length}/11`, inline: true },
          ).setColor(0x3498db);
        await interaction.reply({ embeds: [embed] });
        return;
      }
    }

    if (name === 'createplayer') {
      const pName = interaction.options.getString('name');
      const position = interaction.options.getString('position');
      const rating = interaction.options.getInteger('rating') || (60 + Math.floor(Math.random() * 31));
      const id = makePlayerId(pName);
      data.players[id] = { id, name: pName, position, rating, ownerId: null };
      saveData(data);
      await interaction.reply(`✅ Created **${pName}** (${position}, rating ${rating}) — now a free agent. Sign them with \`/player sign\`.`);
      return;
    }

    if (name === 'player') {
      if (sub === 'sign') {
        const pName = interaction.options.getString('name');
        const player = Object.values(data.players).find((p) => p.name.toLowerCase() === pName.toLowerCase() && !p.ownerId);
        if (!player) { await interaction.reply({ content: 'No free-agent player with that name.', ephemeral: true }); return; }
        const team = getTeam(interaction.user.id);
        if (!team) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
        team.squad = team.squad || [];
        if (team.squad.length >= 11) { await interaction.reply({ content: 'Your squad is full (11/11). Release someone first.', ephemeral: true }); return; }
        player.ownerId = interaction.user.id;
        team.squad.push(player.id);
        saveData(data);
        await interaction.reply(`✅ Signed **${player.name}**! Squad: ${team.squad.length}/11.`);
        return;
      }
      if (sub === 'release') {
        const pName = interaction.options.getString('name');
        const team = getTeam(interaction.user.id);
        const player = team?.squad?.map((id) => data.players[id]).find((p) => p?.name.toLowerCase() === pName.toLowerCase());
        if (!player) { await interaction.reply({ content: "That player isn't in your squad.", ephemeral: true }); return; }
        player.ownerId = null;
        team.squad = team.squad.filter((id) => id !== player.id);
        saveData(data);
        await interaction.reply(`✅ Released **${player.name}** back to free agency.`);
        return;
      }
      if (sub === 'squad') {
        const target = interaction.options.getUser('user') || interaction.user;
        const players = getSquadPlayers(target.id);
        if (players.length === 0) { await interaction.reply(`${target.username} has no squad players yet.`); return; }
        const lines = players.map((p) => `${p.position} — ${p.name} (${p.rating})`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${getTeam(target.id)?.name || target.username}'s Squad`).setDescription(lines.join('\n')).setColor(0x3498db)] });
        return;
      }
      if (sub === 'list') {
        const freeAgents = Object.values(data.players).filter((p) => !p.ownerId);
        if (freeAgents.length === 0) { await interaction.reply('No free agents right now — create one with /createplayer.'); return; }
        const lines = freeAgents.slice(0, 40).map((p) => `${p.position} — ${p.name} (${p.rating})`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🆓 Free Agents').setDescription(lines.join('\n')).setColor(0x95a5a6)] });
        return;
      }
    }

    if (name === 'balance') { await interaction.reply(`💰 You have **${getCoins(interaction.user.id)} coins**.`); return; }
    if (name === 'daily') {
      const last = data.lastDaily[interaction.user.id] || 0;
      if (Date.now() - last < 24 * 60 * 60 * 1000) {
        const hrs = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        await interaction.reply({ content: `⏳ Already claimed. Try again in ~${hrs}h.`, ephemeral: true });
        return;
      }
      const boosts = getBoosts(interaction.user.id);
      let amount = DAILY_AMOUNT;
      if (boosts.doubleDaily) { amount *= 2; delete boosts.doubleDaily; }
      data.lastDaily[interaction.user.id] = Date.now();
      addCoins(interaction.user.id, amount);
      saveData(data);
      await interaction.reply(`💰 Claimed **${amount} coins**! Balance: ${getCoins(interaction.user.id)}.`);
      return;
    }
    if (name === 'leaderboard') {
      const type = interaction.options.getString('type');
      let entries = type === 'coins'
        ? Object.entries(data.coins).sort((a, b) => b[1] - a[1]).slice(0, 10)
        : Object.entries(data.teams).map(([id, t]) => [id, t.trophies]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (entries.length === 0) { await interaction.reply('No data yet.'); return; }
      const lines = await Promise.all(entries.map(async ([userId, val], i) => {
        const user = await client.users.fetch(userId).catch(() => null);
        return `**${i + 1}.** ${user ? user.username : 'Unknown'} — ${val} ${type === 'coins' ? 'coins' : 'trophies'}`;
      }));
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Leaderboard — ${type}`).setDescription(lines.join('\n')).setColor(0xf1c40f)] });
      return;
    }

    if (name === 'matchsim') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.id === interaction.user.id) { await interaction.reply({ content: "You can't play yourself.", ephemeral: true }); return; }
      if (!getTeam(interaction.user.id) || !getTeam(opponent.id)) { await interaction.reply({ content: 'Both players need a team set (/team set) first.', ephemeral: true }); return; }
      await interaction.reply('⚽ Kicking off...');
      await playMatch(interaction.channel, interaction.user.id, opponent.id, 'Friendly Match');
      return;
    }

    if (name === 'penalty') {
      let scored = 0; const results = [];
      for (let i = 0; i < 5; i++) { const hit = Math.random() < 0.7; if (hit) scored++; results.push(hit ? '⚽' : '🧤'); }
      const coinsWon = scored * 10;
      addCoins(interaction.user.id, coinsWon);
      saveData(data);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🥅 Penalty Shootout').setDescription(`${results.join(' ')}\n\nScored **${scored}/5**! +${coinsWon} coins.`).setColor(0xf1c40f)] });
      return;
    }
    if (name === 'var') {
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📺 VAR Review').setDescription(VAR_OUTCOMES[Math.floor(Math.random() * VAR_OUTCOMES.length)]).setColor(0x95a5a6)] });
      return;
    }
    if (name === 'card') {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const isRed = Math.random() < 0.2;
      const type = isRed ? 'red' : 'yellow';
      const offense = reason || CARD_QUOTES[type][Math.floor(Math.random() * CARD_QUOTES[type].length)];
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${isRed ? '🟥' : '🟨'} ${isRed ? 'Red' : 'Yellow'} Card!`).setDescription(`${target} has been booked for **${offense}**.${isRed ? ' Off you go! 🚶' : ''}`).setColor(isRed ? 0xe74c3c : 0xf1c40f)] });
      return;
    }
    if (name === 'chant') {
      const team = getTeam(interaction.user.id);
      if (!team) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
      await interaction.reply(CHANTS[Math.floor(Math.random() * CHANTS.length)].replace(/{team}/g, team.name));
      return;
    }

    if (name === 'shop') {
      if (sub === 'view') {
        const lines = [
          `**starstriker** — ${SHOP_PRICES.starstriker} coins — +1 guaranteed goal next match`,
          `**ironwall** — ${SHOP_PRICES.ironwall} coins — -1 opponent's goals next match`,
          `**luckycharm** — ${SHOP_PRICES.luckycharm} coins — +1 head-start goal next match`,
          `**doubledaily** — ${SHOP_PRICES.doubledaily} coins — next /daily claim pays double`,
        ];
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛒 Transfer Market').setDescription(lines.join('\n')).setColor(0x1abc9c)] });
        return;
      }
      if (sub === 'buy') {
        const item = interaction.options.getString('item');
        if (getCoins(interaction.user.id) < SHOP_PRICES[item]) { await interaction.reply({ content: `Need ${SHOP_PRICES[item]} coins.`, ephemeral: true }); return; }
        addCoins(interaction.user.id, -SHOP_PRICES[item]);
        const boosts = getBoosts(interaction.user.id);
        if (item === 'starstriker') boosts.starStriker = true;
        if (item === 'ironwall') boosts.ironWall = true;
        if (item === 'luckycharm') boosts.luckyCharm = true;
        if (item === 'doubledaily') boosts.doubleDaily = true;
        saveData(data);
        await interaction.reply(`✅ Purchased **${item}**! Applies automatically next time it's relevant.`);
        return;
      }
    }

    if (name === 'tournament') {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (sub === 'create') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        if (data.tournament && data.tournament.status !== 'completed') { await interaction.reply({ content: 'A tournament is already active. End it first.', ephemeral: true }); return; }
        const type = interaction.options.getString('type');
        const size = parseInt(interaction.options.getString('size'), 10);
        const prize = interaction.options.getString('prize');
        const customName = interaction.options.getString('name') || 'Custom Cup';
        const prizeRole = interaction.options.getRole('prize_role');
        data.tournament = {
          type, name: customName, prize, prizeRoleId: prizeRole?.id || null, size,
          status: 'registration', participants: [], groups: null, groupMatches: null, rounds: [], channelId: interaction.channel.id,
        };
        saveData(data);
        const displayName = tournamentDisplayName(data.tournament);
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`🏆 ${displayName}`)
            .setDescription(`Registration open! Need **${size}** teams for the knockout stage (or more if you want a group stage first).\nPrize: ${prize}\nJoin with \`/tournament join\` (set a team with \`/team set\` first).`)
            .setColor(0x3498db)],
        });
        return;
      }
      if (sub === 'join') {
        if (!data.tournament || data.tournament.status !== 'registration') { await interaction.reply({ content: 'No tournament open for registration.', ephemeral: true }); return; }
        if (!getTeam(interaction.user.id)) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
        if (data.tournament.participants.includes(interaction.user.id)) { await interaction.reply({ content: "You're already in.", ephemeral: true }); return; }
        data.tournament.participants.push(interaction.user.id);
        saveData(data);
        await interaction.reply(`✅ ${getTeam(interaction.user.id).name} joined! (${data.tournament.participants.length} teams so far)`);
        return;
      }
      if (sub === 'leave') {
        if (!data.tournament || data.tournament.status !== 'registration') { await interaction.reply({ content: 'No open registration to leave.', ephemeral: true }); return; }
        data.tournament.participants = data.tournament.participants.filter((id) => id !== interaction.user.id);
        saveData(data);
        await interaction.reply('✅ You left the tournament.');
        return;
      }
      if (sub === 'creategroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament in registration.', ephemeral: true }); return; }
        const numGroups = interaction.options.getInteger('num_groups');
        const shuffled = shuffle(t.participants);
        const groups = Array.from({ length: numGroups }, () => []);
        shuffled.forEach((id, i) => groups[i % numGroups].push(id));
        t.groups = groups;
        t.groupMatches = groups.map((g) => buildRoundRobin(g));
        t.status = 'groups';
        saveData(data);
        const letters = 'ABCDEFGH';
        const lines = groups.map((g, i) => `**Group ${letters[i]}:** ${g.map((id) => getTeam(id).name).join(', ')}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — Group Stage`).setDescription(lines.join('\n')).setColor(0x3498db)] });
        return;
      }
      if (sub === 'playgroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t || t.status !== 'groups') { await interaction.reply({ content: 'No group stage in progress.', ephemeral: true }); return; }
        await interaction.reply('⏳ Simulating all remaining group matches...');
        for (const groupMatches of t.groupMatches) {
          for (const m of groupMatches) {
            if (m.played) continue;
            const result = simulateMatchInstant(m.p1, m.p2);
            m.goalsA = result.goalsA; m.goalsB = result.goalsB; m.played = true;
          }
        }
        saveData(data);
        await interaction.followUp('✅ Group stage matches complete! Check `/tournament standings`.');
        return;
      }
      if (sub === 'standings') {
        const t = data.tournament;
        if (!t?.groups) { await interaction.reply({ content: 'No group stage set up.', ephemeral: true }); return; }
        const letters = 'ABCDEFGH';
        const embed = new EmbedBuilder().setTitle(`📊 ${tournamentDisplayName(t)} — Standings`).setColor(0x3498db);
        t.groups.forEach((g, i) => {
          const table = groupStandings(g, t.groupMatches[i]);
          const lines = table.map((row, pos) => `${pos + 1}. ${getTeam(row.id).name} — ${row.pts}pts (GD ${row.gf - row.ga})`);
          embed.addFields({ name: `Group ${letters[i]}`, value: lines.join('\n') });
        });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'advancegroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t?.groups) { await interaction.reply({ content: 'No group stage set up.', ephemeral: true }); return; }
        const top = interaction.options.getInteger('top');
        const advancers = [];
        t.groups.forEach((g, i) => {
          const table = groupStandings(g, t.groupMatches[i]);
          advancers.push(...table.slice(0, top).map((row) => row.id));
        });
        if (![2, 4, 8, 16, 32].includes(advancers.length)) {
          await interaction.reply({ content: `Advancing produces ${advancers.length} teams, which isn't a valid knockout size (2/4/8/16/32). Adjust "top" or group count.`, ephemeral: true });
          return;
        }
        t.rounds = [buildKnockoutRound(advancers)];
        t.status = 'knockout';
        saveData(data);
        await interaction.reply(`✅ ${advancers.length} teams advance to the ${roundNameForSize(advancers.length)}! First match coming up...`);
        await startNextKnockoutMatch(interaction.guild);
        return;
      }
      if (sub === 'start') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament in registration.', ephemeral: true }); return; }
        if (t.participants.length !== t.size) { await interaction.reply({ content: `Need exactly ${t.size} participants (have ${t.participants.length}).`, ephemeral: true }); return; }
        t.rounds = [buildKnockoutRound(t.participants)];
        t.status = 'knockout';
        t.channelId = interaction.channel.id;
        saveData(data);
        await interaction.reply(`✅ ${tournamentDisplayName(t)} is starting! First match coming up...`);
        await startNextKnockoutMatch(interaction.guild);
        return;
      }
      if (sub === 'bracket' || sub === 'status') {
        const t = data.tournament;
        if (!t) { await interaction.reply({ content: 'No tournament right now.', ephemeral: true }); return; }
        if (t.status === 'registration') { await interaction.reply(`**${tournamentDisplayName(t)}** — Registration: ${t.participants.length} teams joined.`); return; }
        if (t.status === 'groups') { await interaction.reply('Group stage in progress — use `/tournament standings`.'); return; }
        const currentRound = t.rounds[t.rounds.length - 1];
        const lines = currentRound.map((m) => {
          const p1Name = getTeam(m.p1)?.name || '???';
          const p2Name = getTeam(m.p2)?.name || '???';
          return m.winner ? `~~${p1Name} vs ${p2Name}~~ → **${getTeam(m.winner).name}**` : `${p1Name} vs ${p2Name}`;
        });
        const embed = new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — ${roundNameForSize(currentRound.length * 2)}`).setDescription(lines.join('\n')).setColor(0x3498db);
        if (t.status === 'completed') embed.setFooter({ text: `Champion: ${getTeam(t.champion)?.name || 'Unknown'}` });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'end') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        data.tournament = null;
        saveData(data);
        await interaction.reply('✅ Tournament cancelled.');
        return;
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
});

client.login(process.env.BOT_TOKEN);