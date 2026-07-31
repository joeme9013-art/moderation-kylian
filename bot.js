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

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      teams: {}, coins: {}, lastDaily: {}, boosts: {}, tournament: null,
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.teams ??= {};
  parsed.coins ??= {};
  parsed.lastDaily ??= {};
  parsed.boosts ??= {};
  parsed.tournament ??= null;
  return parsed;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

function cdnFlag(code) { return `https://flagcdn.com/w320/${code}.png`; }

// ============================================================
// COUNTRIES — every UN member state + Vatican + Palestine (observer
// state), plus England/Scotland/Wales as bonus non-sovereign options
// since they field separate national football teams.
// ============================================================
const COUNTRIES = [
  // Africa
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
  // Americas
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
  // Asia
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
  // Europe
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
  // Oceania
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

// ============================================================
// INSTANT SIMULATION (for /matchsim and /predict — casual, one-shot)
// ============================================================
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
function randomGoals(chanceBoost = 0) {
  const roll = Math.random();
  let base = GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)];
  if (roll < chanceBoost) base += 1;
  return base;
}
function simulateMatchInstant(userIdA, userIdB) {
  const boostsA = getBoosts(userIdA), boostsB = getBoosts(userIdB);
  const boostA = boostsA.starStriker ? 0.3 : 0;
  const boostB = boostsB.starStriker ? 0.3 : 0;
  if (boostsA.starStriker) delete boostsA.starStriker;
  if (boostsB.starStriker) delete boostsB.starStriker;

  const scoreA = randomGoals(boostA);
  const scoreB = randomGoals(boostB);
  let penalties = null;
  let winnerId;
  if (scoreA === scoreB) {
    let penA = 0, penB = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.75) penA++; if (Math.random() < 0.75) penB++; }
    while (penA === penB) { if (Math.random() < 0.5) penA++; else penB++; }
    penalties = { penA, penB };
    winnerId = penA > penB ? userIdA : userIdB;
  } else {
    winnerId = scoreA > scoreB ? userIdA : userIdB;
  }
  return { scoreA, scoreB, penalties, winnerId };
}
function matchLine(userIdA, userIdB, result) {
  const nameA = getTeam(userIdA)?.name || `<@${userIdA}>`;
  const nameB = getTeam(userIdB)?.name || `<@${userIdB}>`;
  let line = `**${nameA}** ${result.scoreA} - ${result.scoreB} **${nameB}**`;
  if (result.penalties) line += ` *(pens: ${result.penalties.penA}-${result.penalties.penB})*`;
  return line;
}

// ============================================================
// TOURNAMENT — live scoring. Each match runs for a fixed window;
// both players use /score to try to find the net. When time's up,
// the result is announced and the next match starts automatically,
// cycling through every round until the Final crowns a champion.
// ============================================================
const MATCH_DURATION_MS = 3 * 60 * 1000; // 3 minutes per match
const SCORE_COOLDOWN_MS = 8 * 1000;      // 8 seconds between attempts
const BASE_SCORE_CHANCE = 0.35;
const scoreCooldowns = new Map(); // userId -> timestamp, in-memory only

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
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function buildRound(participants) {
  const shuffled = shuffle(participants);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) matches.push({ p1: shuffled[i], p2: shuffled[i + 1], winner: null, result: null });
  return matches;
}

async function getTournamentChannel(guild) {
  const t = data.tournament;
  if (!t?.channelId) return null;
  return guild.channels.cache.get(t.channelId) || await guild.channels.fetch(t.channelId).catch(() => null);
}

async function startNextMatch(guild) {
  const t = data.tournament;
  if (!t || t.status !== 'in_progress') return;
  const round = t.rounds[t.rounds.length - 1];
  const idx = round.findIndex((m) => !m.winner);

  if (idx === -1) {
    // Round complete — advance to next round or crown champion
    const winners = round.map((m) => m.winner);
    if (winners.length === 1) {
      await crownChampion(guild, winners[0]);
      return;
    }
    t.rounds.push(buildRound(winners));
    saveData(data);
    const channel = await getTournamentChannel(guild);
    if (channel) {
      await channel.send({
        embeds: [new EmbedBuilder().setTitle(`🏆 ${t.name} — ${roundNameForSize(winners.length)} begins!`).setColor(0x3498db)],
      });
    }
    return startNextMatch(guild);
  }

  const match = round[idx];
  const boosts1 = getBoosts(match.p1), boosts2 = getBoosts(match.p2);
  let chance1 = BASE_SCORE_CHANCE, chance2 = BASE_SCORE_CHANCE;
  let startGoals1 = 0, startGoals2 = 0;
  if (boosts1.starStriker) { chance1 += 0.15; delete boosts1.starStriker; }
  if (boosts2.starStriker) { chance2 += 0.15; delete boosts2.starStriker; }
  if (boosts1.ironWall) { chance2 -= 0.15; delete boosts1.ironWall; }
  if (boosts2.ironWall) { chance1 -= 0.15; delete boosts2.ironWall; }
  if (boosts1.luckyCharm) { startGoals1 += 1; delete boosts1.luckyCharm; }
  if (boosts2.luckyCharm) { startGoals2 += 1; delete boosts2.luckyCharm; }

  t.liveMatch = {
    matchIndex: idx, p1: match.p1, p2: match.p2,
    p1Goals: startGoals1, p2Goals: startGoals2,
    p1Chance: Math.max(0.05, chance1), p2Chance: Math.max(0.05, chance2),
    endsAt: Date.now() + MATCH_DURATION_MS,
  };
  saveData(data);

  const channel = await getTournamentChannel(guild);
  if (channel) {
    const team1 = getTeam(match.p1), team2 = getTeam(match.p2);
    await channel.send({
      embeds: [new EmbedBuilder()
        .setTitle(`⚽ ${roundNameForSize(round.length * 2)} — Match starting!`)
        .setDescription(`<@${match.p1}> (**${team1.name}**) vs <@${match.p2}> (**${team2.name}**)\n\nUse \`/score\` to try to find the net! Match ends in 3 minutes.`)
        .setThumbnail(cdnFlag(team1.code))
        .setColor(0x2ecc71)],
    });
  }

  setTimeout(() => resolveLiveMatch(guild).catch(console.error), MATCH_DURATION_MS);
}

async function resolveLiveMatch(guild) {
  const t = data.tournament;
  if (!t || !t.liveMatch) return;
  const lm = t.liveMatch;
  const round = t.rounds[t.rounds.length - 1];
  const match = round[lm.matchIndex];
  if (!match || match.winner) return; // already resolved (e.g. via skipmatch)

  let { p1Goals, p2Goals } = lm;
  let penalties = null;
  let winnerId;
  if (p1Goals === p2Goals) {
    let penA = 0, penB = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.75) penA++; if (Math.random() < 0.75) penB++; }
    while (penA === penB) { if (Math.random() < 0.5) penA++; else penB++; }
    penalties = { penA, penB };
    winnerId = penA > penB ? lm.p1 : lm.p2;
  } else {
    winnerId = p1Goals > p2Goals ? lm.p1 : lm.p2;
  }

  match.winner = winnerId;
  match.result = { scoreA: p1Goals, scoreB: p2Goals, penalties };
  const winnerTeam = getTeam(winnerId);
  const loserId = winnerId === lm.p1 ? lm.p2 : lm.p1;
  winnerTeam.wins += 1;
  getTeam(loserId).losses += 1;
  addCoins(winnerId, 25);
  t.liveMatch = null;
  saveData(data);

  const channel = await getTournamentChannel(guild);
  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder().setTitle('🏁 Full Time!').setDescription(matchLine(lm.p1, lm.p2, match.result)).setColor(0x2ecc71)],
    });
  }

  await startNextMatch(guild);
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
      embeds: [new EmbedBuilder()
        .setTitle(`🏆🎉 ${champTeam.name} WINS ${t.name}!`)
        .setDescription(`Prize: ${t.prize}\n+200 coins awarded.`)
        .setThumbnail(cdnFlag(champTeam.code))
        .setColor(0xffd700)],
    });
  }
}

// ============================================================
// SLASH COMMANDS
// ============================================================
const sizeChoices = [
  { name: 'Round of 32 (32 teams)', value: '32' },
  { name: 'Round of 16 (16 teams)', value: '16' },
  { name: 'Quarterfinals (8 teams)', value: '8' },
  { name: 'Semifinals (4 teams)', value: '4' },
];
const shopChoices = [
  { name: 'Star Striker — boosts your scoring chance next match', value: 'starstriker' },
  { name: 'Iron Wall — reduces your opponent\'s scoring chance next match', value: 'ironwall' },
  { name: 'Lucky Charm — free head-start goal next match', value: 'luckycharm' },
  { name: 'Double Daily — your next /daily claim pays double', value: 'doubledaily' },
];

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),

  new SlashCommandBuilder().setName('team').setDescription('Manage your national team.')
    .addSubcommand((s) => s.setName('set').setDescription('Choose the country you represent.')
      .addStringOption((o) => o.setName('country').setDescription('Country name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('profile').setDescription("View a team's profile.")
      .addUserOption((o) => o.setName('user').setDescription('Whose profile').setRequired(false))),

  new SlashCommandBuilder().setName('balance').setDescription('Check your coin balance.'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins.'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top players.')
    .addStringOption((o) => o.setName('type').setDescription('Rank by').setRequired(true)
      .addChoices({ name: 'coins', value: 'coins' }, { name: 'trophies', value: 'trophies' })),

  new SlashCommandBuilder().setName('score').setDescription('Attempt to score in the current live tournament match!'),

  new SlashCommandBuilder().setName('matchsim').setDescription('Instantly simulate a casual friendly match.')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to play').setRequired(true)),
  new SlashCommandBuilder().setName('predict').setDescription('Predict a friendly match outcome for coins.')
    .addUserOption((o) => o.setName('team1').setDescription('First team').setRequired(true))
    .addUserOption((o) => o.setName('team2').setDescription('Second team').setRequired(true))
    .addUserOption((o) => o.setName('pick').setDescription('Who you think wins').setRequired(true)),
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

  new SlashCommandBuilder().setName('tournament').setDescription('World Cup tournament commands.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new tournament. Admin only.')
      .addStringOption((o) => o.setName('name').setDescription('Tournament name').setRequired(true))
      .addStringOption((o) => o.setName('size').setDescription('Bracket size').setRequired(true).addChoices(...sizeChoices))
      .addStringOption((o) => o.setName('prize').setDescription('Prize description').setRequired(true))
      .addRoleOption((o) => o.setName('prize_role').setDescription('Role to award the champion').setRequired(false)))
    .addSubcommand((s) => s.setName('join').setDescription('Join the open tournament.'))
    .addSubcommand((s) => s.setName('leave').setDescription('Leave the open tournament.'))
    .addSubcommand((s) => s.setName('start').setDescription('Start the tournament — begins the first match automatically. Admin only.'))
    .addSubcommand((s) => s.setName('bracket').setDescription('View the current bracket.'))
    .addSubcommand((s) => s.setName('status').setDescription('View tournament + live match status.'))
    .addSubcommand((s) => s.setName('skipmatch').setDescription('Force-resolve the current live match now. Admin only.'))
    .addSubcommand((s) => s.setName('end').setDescription('Cancel the current tournament. Admin only.')),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

// ============================================================
// SHOP PRICES / DAILY
// ============================================================
const SHOP_PRICES = { starstriker: 80, ironwall: 80, luckycharm: 120, doubledaily: 50 };
const DAILY_AMOUNT = 25;

// ============================================================
// FOOTBALL FLAVOR TEXT
// ============================================================
const VAR_OUTCOMES = [
  '🟩 VAR confirms the original decision. No change.',
  '🟥 VAR overturns it! That result is getting reviewed by the panel.',
  '📺 VAR is taking a while... the referee is checking the monitor... decision stands.',
  '🎥 After a lengthy review, VAR sides with the referee. Play on.',
];
const CHANTS = [
  '🎶 Ohhh {team}, we love you! 🎶',
  '🎶 {team}, {team}, {team}! 🎶',
  '🎶 We are the {team}, the mighty mighty {team}! 🎶',
  '🎶 Que sera sera, whatever will be, {team} in the final, {team} in the final! 🎶',
  '🎶 Allez, allez, allez! {team} till we die! 🎶',
];
const CARD_QUOTES = {
  yellow: ['a reckless challenge', 'excessive celebrating', 'dissent', 'time-wasting'],
  red: ['a two-footed lunge', 'violent conduct', 'denying a clear goalscoring opportunity'],
};

// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (interaction.commandName === 'team' && focused.name === 'country') {
        const q = focused.value.toLowerCase();
        const matches = COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25)
          .map((c) => ({ name: c.name, value: c.code }));
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
          'WORLD CUP BOT COMMANDS:\n' +
          '/team set, /team profile\n' +
          '/balance, /daily, /leaderboard\n' +
          '/score  (use during a live tournament match)\n' +
          '/matchsim, /predict, /penalty\n' +
          '/var, /card, /chant\n' +
          '/shop view, /shop buy\n' +
          '/tournament create/join/leave/start/bracket/status/skipmatch/end\n' +
          '```',
      });
      return;
    }

    if (name === 'team') {
      if (sub === 'set') {
        const code = interaction.options.getString('country');
        const country = COUNTRIES.find((c) => c.code === code);
        if (!country) { await interaction.reply({ content: 'Pick a country from the list.', ephemeral: true }); return; }
        data.teams[interaction.user.id] = { ...(data.teams[interaction.user.id] || { wins: 0, losses: 0, trophies: 0 }), code: country.code, name: country.name };
        saveData(data);
        await interaction.reply({ content: `✅ You now represent **${country.name}**!`, embeds: [new EmbedBuilder().setThumbnail(cdnFlag(country.code)).setColor(0x2ecc71)] });
        return;
      }
      if (sub === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const team = getTeam(target.id);
        if (!team) { await interaction.reply(`${target.username} hasn't picked a team yet — use /team set.`); return; }
        const embed = new EmbedBuilder()
          .setTitle(`${team.name} — ${target.username}`)
          .setThumbnail(cdnFlag(team.code))
          .addFields(
            { name: 'Wins', value: `${team.wins}`, inline: true },
            { name: 'Losses', value: `${team.losses}`, inline: true },
            { name: '🏆 Trophies', value: `${team.trophies}`, inline: true },
            { name: '💰 Coins', value: `${getCoins(target.id)}`, inline: true },
          ).setColor(0x3498db);
        await interaction.reply({ embeds: [embed] });
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

    if (name === 'score') {
      const t = data.tournament;
      if (!t || t.status !== 'in_progress' || !t.liveMatch) { await interaction.reply({ content: 'No live match right now.', ephemeral: true }); return; }
      const lm = t.liveMatch;
      const userId = interaction.user.id;
      if (userId !== lm.p1 && userId !== lm.p2) { await interaction.reply({ content: "You're not in the current match.", ephemeral: true }); return; }

      const lastAttempt = scoreCooldowns.get(userId) || 0;
      const remaining = SCORE_COOLDOWN_MS - (Date.now() - lastAttempt);
      if (remaining > 0) { await interaction.reply({ content: `⏱️ Catch your breath — try again in ${Math.ceil(remaining / 1000)}s.`, ephemeral: true }); return; }
      scoreCooldowns.set(userId, Date.now());

      const isP1 = userId === lm.p1;
      const chance = isP1 ? lm.p1Chance : lm.p2Chance;
      const scored = Math.random() < chance;
      if (scored) { if (isP1) lm.p1Goals++; else lm.p2Goals++; saveData(data); }

      const team1 = getTeam(lm.p1), team2 = getTeam(lm.p2);
      await interaction.reply(
        scored
          ? `⚽ GOAL! **${getTeam(userId).name}** scores! Current score: **${team1.name}** ${lm.p1Goals} - ${lm.p2Goals} **${team2.name}**`
          : `🧤 Saved! No goal this time. Score: **${team1.name}** ${lm.p1Goals} - ${lm.p2Goals} **${team2.name}**`,
      );
      return;
    }

    if (name === 'matchsim') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.id === interaction.user.id) { await interaction.reply({ content: "You can't play yourself.", ephemeral: true }); return; }
      const teamA = getTeam(interaction.user.id), teamB = getTeam(opponent.id);
      if (!teamA || !teamB) { await interaction.reply({ content: 'Both players need a team set (/team set) first.', ephemeral: true }); return; }
      const result = simulateMatchInstant(interaction.user.id, opponent.id);
      const winnerTeam = result.winnerId === interaction.user.id ? teamA : teamB;
      winnerTeam.wins += 1;
      (result.winnerId === interaction.user.id ? teamB : teamA).losses += 1;
      addCoins(result.winnerId, 15);
      saveData(data);
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('⚽ Friendly Match Result').setDescription(matchLine(interaction.user.id, opponent.id, result))
          .addFields({ name: 'Winner', value: winnerTeam.name }).setColor(0x2ecc71)],
      });
      return;
    }

    if (name === 'predict') {
      const u1 = interaction.options.getUser('team1');
      const u2 = interaction.options.getUser('team2');
      const pick = interaction.options.getUser('pick');
      if (![u1.id, u2.id].includes(pick.id)) { await interaction.reply({ content: 'Your pick has to be one of the two teams.', ephemeral: true }); return; }
      const teamA = getTeam(u1.id), teamB = getTeam(u2.id);
      if (!teamA || !teamB) { await interaction.reply({ content: 'Both teams need to be set first.', ephemeral: true }); return; }
      const result = simulateMatchInstant(u1.id, u2.id);
      const correct = result.winnerId === pick.id;
      if (correct) addCoins(interaction.user.id, 20);
      saveData(data);
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🔮 Prediction Result')
          .setDescription(`${matchLine(u1.id, u2.id, result)}\n\n${correct ? '✅ Correct! +20 coins' : '❌ Wrong prediction.'}`)
          .setColor(correct ? 0x2ecc71 : 0xe74c3c)],
      });
      return;
    }

    if (name === 'penalty') {
      let scored = 0;
      const results = [];
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
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle(`${isRed ? '🟥' : '🟨'} ${isRed ? 'Red' : 'Yellow'} Card!`)
          .setDescription(`${target} has been booked for **${offense}**.${isRed ? ' Off you go! 🚶' : ''}`).setColor(isRed ? 0xe74c3c : 0xf1c40f)],
      });
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
          `**starstriker** — ${SHOP_PRICES.starstriker} coins — boosts your scoring chance next match`,
          `**ironwall** — ${SHOP_PRICES.ironwall} coins — reduces your opponent's scoring chance next match`,
          `**luckycharm** — ${SHOP_PRICES.luckycharm} coins — free head-start goal next match`,
          `**doubledaily** — ${SHOP_PRICES.doubledaily} coins — your next /daily claim pays double`,
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
        await interaction.reply(`✅ Purchased **${item}**! It'll apply automatically next time it's relevant.`);
        return;
      }
    }

    if (name === 'tournament') {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (sub === 'create') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        if (data.tournament && data.tournament.status !== 'completed') { await interaction.reply({ content: 'A tournament is already active. End it first.', ephemeral: true }); return; }
        const tName = interaction.options.getString('name');
        const size = parseInt(interaction.options.getString('size'), 10);
        const prize = interaction.options.getString('prize');
        const prizeRole = interaction.options.getRole('prize_role');
        data.tournament = { name: tName, size, prize, prizeRoleId: prizeRole?.id || null, status: 'registration', participants: [], rounds: [], channelId: interaction.channel.id };
        saveData(data);
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`🏆 ${tName}`).setDescription(`Registration open! Need **${size}** teams.\nPrize: ${prize}\nJoin with \`/tournament join\` (set a team with \`/team set\` first).`).setColor(0x3498db)],
        });
        return;
      }
      if (sub === 'join') {
        if (!data.tournament || data.tournament.status !== 'registration') { await interaction.reply({ content: 'No tournament open for registration.', ephemeral: true }); return; }
        if (!getTeam(interaction.user.id)) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
        if (data.tournament.participants.includes(interaction.user.id)) { await interaction.reply({ content: "You're already in.", ephemeral: true }); return; }
        if (data.tournament.participants.length >= data.tournament.size) { await interaction.reply({ content: 'Tournament is full.', ephemeral: true }); return; }
        data.tournament.participants.push(interaction.user.id);
        saveData(data);
        await interaction.reply(`✅ ${getTeam(interaction.user.id).name} joined! (${data.tournament.participants.length}/${data.tournament.size})`);
        return;
      }
      if (sub === 'leave') {
        if (!data.tournament || data.tournament.status !== 'registration') { await interaction.reply({ content: 'No open registration to leave.', ephemeral: true }); return; }
        data.tournament.participants = data.tournament.participants.filter((id) => id !== interaction.user.id);
        saveData(data);
        await interaction.reply('✅ You left the tournament.');
        return;
      }
      if (sub === 'start') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament in registration.', ephemeral: true }); return; }
        if (t.participants.length !== t.size) { await interaction.reply({ content: `Need exactly ${t.size} participants (have ${t.participants.length}).`, ephemeral: true }); return; }
        t.rounds = [buildRound(t.participants)];
        t.status = 'in_progress';
        t.channelId = interaction.channel.id;
        saveData(data);
        await interaction.reply(`✅ ${t.name} is starting! First match coming up...`);
        await startNextMatch(interaction.guild);
        return;
      }
      if (sub === 'bracket' || sub === 'status') {
        const t = data.tournament;
        if (!t) { await interaction.reply({ content: 'No tournament right now.', ephemeral: true }); return; }
        if (t.status === 'registration') { await interaction.reply(`**${t.name}** — Registration: ${t.participants.length}/${t.size} teams joined.`); return; }
        const currentRound = t.rounds[t.rounds.length - 1];
        const lines = currentRound.map((m) => {
          const p1Name = getTeam(m.p1)?.name || '???';
          const p2Name = getTeam(m.p2)?.name || '???';
          if (m.winner) return `~~${p1Name} vs ${p2Name}~~ → **${getTeam(m.winner).name}**`;
          if (t.liveMatch && round_p1p2Match(t.liveMatch, m)) return `🔴 LIVE: ${p1Name} ${t.liveMatch.p1Goals} - ${t.liveMatch.p2Goals} ${p2Name}`;
          return `${p1Name} vs ${p2Name}`;
        });
        const embed = new EmbedBuilder().setTitle(`🏆 ${t.name} — ${roundNameForSize(currentRound.length * 2)}`).setDescription(lines.join('\n')).setColor(0x3498db);
        if (t.status === 'completed') embed.setFooter({ text: `Champion: ${getTeam(t.champion)?.name || 'Unknown'}` });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'skipmatch') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        if (!data.tournament?.liveMatch) { await interaction.reply({ content: 'No live match to skip.', ephemeral: true }); return; }
        await interaction.reply({ content: '✅ Resolving current match now...', ephemeral: true });
        await resolveLiveMatch(interaction.guild);
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
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

function round_p1p2Match(liveMatch, match) {
  return liveMatch.p1 === match.p1 && liveMatch.p2 === match.p2;
}

client.login(process.env.BOT_TOKEN);