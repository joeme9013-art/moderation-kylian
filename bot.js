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
      teams: {},        // userId -> { code, name, wins, losses, trophies }
      coins: {},        // userId -> number
      lastDaily: {},     // userId -> timestamp
      boosts: {},        // userId -> { starStriker: true/false }
      tournament: null,  // see buildTournament()
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
// COUNTRIES — pick-a-team roster, real flags via flagcdn
// ============================================================
const COUNTRIES = [
  { name: 'Brazil', code: 'br' }, { name: 'Argentina', code: 'ar' }, { name: 'France', code: 'fr' },
  { name: 'Germany', code: 'de' }, { name: 'Spain', code: 'es' }, { name: 'England', code: 'gb-eng' },
  { name: 'Italy', code: 'it' }, { name: 'Portugal', code: 'pt' }, { name: 'Netherlands', code: 'nl' },
  { name: 'Belgium', code: 'be' }, { name: 'Croatia', code: 'hr' }, { name: 'Uruguay', code: 'uy' },
  { name: 'Japan', code: 'jp' }, { name: 'South Korea', code: 'kr' }, { name: 'Morocco', code: 'ma' },
  { name: 'Senegal', code: 'sn' }, { name: 'USA', code: 'us' }, { name: 'Mexico', code: 'mx' },
  { name: 'Canada', code: 'ca' }, { name: 'Australia', code: 'au' }, { name: 'Nigeria', code: 'ng' },
  { name: 'Ghana', code: 'gh' }, { name: 'Egypt', code: 'eg' }, { name: 'Poland', code: 'pl' },
  { name: 'Switzerland', code: 'ch' }, { name: 'Sweden', code: 'se' }, { name: 'Denmark', code: 'dk' },
  { name: 'Serbia', code: 'rs' }, { name: 'Colombia', code: 'co' }, { name: 'Chile', code: 'cl' },
  { name: 'Peru', code: 'pe' }, { name: 'Ecuador', code: 'ec' }, { name: 'Saudi Arabia', code: 'sa' },
  { name: 'Qatar', code: 'qa' }, { name: 'Iran', code: 'ir' }, { name: 'Tunisia', code: 'tn' },
  { name: 'Algeria', code: 'dz' }, { name: 'Ivory Coast', code: 'ci' }, { name: 'Wales', code: 'gb-wls' },
  { name: 'Scotland', code: 'gb-sct' },
];
function findCountry(nameOrCode) {
  const q = nameOrCode.trim().toLowerCase();
  return COUNTRIES.find((c) => c.name.toLowerCase() === q || c.code === q);
}

// ---------- Team / player helpers ----------
function getTeam(userId) { return data.teams[userId] || null; }
function getCoins(userId) { return data.coins[userId] || 0; }
function addCoins(userId, amount) { data.coins[userId] = Math.max(0, (data.coins[userId] || 0) + amount); }

// ============================================================
// MATCH SIMULATION — weighted random scoreline, penalty tiebreak
// ============================================================
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5]; // skewed toward realistic low scores
function randomGoals(boosted = false) {
  const pool = boosted ? GOAL_WEIGHTS.map((g) => g + (Math.random() < 0.5 ? 1 : 0)) : GOAL_WEIGHTS;
  return pool[Math.floor(Math.random() * pool.length)];
}
function simulateMatch(userIdA, userIdB) {
  const boostA = !!data.boosts[userIdA]?.starStriker;
  const boostB = !!data.boosts[userIdB]?.starStriker;
  if (boostA) delete data.boosts[userIdA].starStriker;
  if (boostB) delete data.boosts[userIdB].starStriker;

  let scoreA = randomGoals(boostA);
  let scoreB = randomGoals(boostB);
  let penalties = null;

  if (scoreA === scoreB) {
    // Penalty shootout tiebreaker
    let penA = 0, penB = 0;
    for (let i = 0; i < 5; i++) {
      if (Math.random() < 0.75) penA++;
      if (Math.random() < 0.75) penB++;
    }
    while (penA === penB) { if (Math.random() < 0.5) penA++; else penB++; }
    penalties = { penA, penB };
  }

  const winnerId = penalties ? (penalties.penA > penalties.penB ? userIdA : userIdB) : (scoreA > scoreB ? userIdA : userIdB);
  return { scoreA, scoreB, penalties, winnerId };
}
function matchLine(userIdA, userIdB, result) {
  const teamA = getTeam(userIdA);
  const teamB = getTeam(userIdB);
  const nameA = teamA ? teamA.name : `<@${userIdA}>`;
  const nameB = teamB ? teamB.name : `<@${userIdB}>`;
  let line = `**${nameA}** ${result.scoreA} - ${result.scoreB} **${nameB}**`;
  if (result.penalties) line += ` *(pens: ${result.penalties.penA}-${result.penalties.penB})*`;
  return line;
}

// ============================================================
// TOURNAMENT BRACKET
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
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function buildFirstRound(participants) {
  const shuffled = shuffle(participants);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({ p1: shuffled[i], p2: shuffled[i + 1], winner: null, result: null });
  }
  return matches;
}

// ============================================================
// SLASH COMMANDS
// ============================================================
const countryChoices = COUNTRIES.map((c) => ({ name: c.name, value: c.code }));
const sizeChoices = [
  { name: 'Round of 32 (32 teams)', value: '32' },
  { name: 'Round of 16 (16 teams)', value: '16' },
  { name: 'Quarterfinals (8 teams)', value: '8' },
  { name: 'Semifinals (4 teams)', value: '4' },
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

  new SlashCommandBuilder().setName('matchsim').setDescription('Simulate a friendly match against another team.')
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
    .addSubcommand((s) => s.setName('buy').setDescription('Buy a boost.')
      .addStringOption((o) => o.setName('item').setDescription('Item to buy').setRequired(true)
        .addChoices({ name: 'Star Striker (boosted goals next match)', value: 'starstriker' }))),

  new SlashCommandBuilder().setName('tournament').setDescription('World Cup tournament commands.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new tournament. Admin only.')
      .addStringOption((o) => o.setName('name').setDescription('Tournament name').setRequired(true))
      .addStringOption((o) => o.setName('size').setDescription('Bracket size').setRequired(true).addChoices(...sizeChoices))
      .addStringOption((o) => o.setName('prize').setDescription('Prize description').setRequired(true))
      .addRoleOption((o) => o.setName('prize_role').setDescription('Role to award the champion').setRequired(false)))
    .addSubcommand((s) => s.setName('join').setDescription('Join the open tournament.'))
    .addSubcommand((s) => s.setName('leave').setDescription('Leave the open tournament.'))
    .addSubcommand((s) => s.setName('start').setDescription('Start the tournament. Admin only.'))
    .addSubcommand((s) => s.setName('bracket').setDescription('View the current bracket.'))
    .addSubcommand((s) => s.setName('status').setDescription('View tournament status.'))
    .addSubcommand((s) => s.setName('simulate').setDescription('Simulate all matches in the current round. Admin only.'))
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
// SHOP
// ============================================================
const SHOP_PRICES = { starstriker: 80 };
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
  "🎶 Ohhh {team}, we love you! 🎶",
  "🎶 {team}, {team}, {team}! 🎶",
  "🎶 We are the {team}, the mighty mighty {team}! 🎶",
  "🎶 Que sera sera, whatever will be, {team} in the final, {team} in the final! 🎶",
  "🎶 Allez, allez, allez! {team} till we die! 🎶",
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

    // ---------- /help ----------
    if (name === 'help') {
      await interaction.reply({
        ephemeral: true,
        content: '```\n' +
          'WORLD CUP BOT COMMANDS:\n' +
          '/team set, /team profile\n' +
          '/balance, /daily, /leaderboard\n' +
          '/matchsim, /predict, /penalty\n' +
          '/var, /card, /chant\n' +
          '/shop view, /shop buy\n' +
          '/tournament create/join/leave/start/bracket/status/simulate/end\n' +
          '```',
      });
      return;
    }

    // ---------- /team ----------
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

    // ---------- economy ----------
    if (name === 'balance') {
      await interaction.reply(`💰 You have **${getCoins(interaction.user.id)} coins**.`);
      return;
    }
    if (name === 'daily') {
      const last = data.lastDaily[interaction.user.id] || 0;
      if (Date.now() - last < 24 * 60 * 60 * 1000) {
        const hrs = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        await interaction.reply({ content: `⏳ Already claimed. Try again in ~${hrs}h.`, ephemeral: true });
        return;
      }
      data.lastDaily[interaction.user.id] = Date.now();
      addCoins(interaction.user.id, DAILY_AMOUNT);
      saveData(data);
      await interaction.reply(`💰 Claimed **${DAILY_AMOUNT} coins**! Balance: ${getCoins(interaction.user.id)}.`);
      return;
    }
    if (name === 'leaderboard') {
      const type = interaction.options.getString('type');
      let entries;
      if (type === 'coins') {
        entries = Object.entries(data.coins).sort((a, b) => b[1] - a[1]).slice(0, 10);
      } else {
        entries = Object.entries(data.teams).map(([id, t]) => [id, t.trophies]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      }
      if (entries.length === 0) { await interaction.reply('No data yet.'); return; }
      const lines = await Promise.all(entries.map(async ([userId, val], i) => {
        const user = await client.users.fetch(userId).catch(() => null);
        return `**${i + 1}.** ${user ? user.username : 'Unknown'} — ${val} ${type === 'coins' ? 'coins' : 'trophies'}`;
      }));
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Leaderboard — ${type}`).setDescription(lines.join('\n')).setColor(0xf1c40f)] });
      return;
    }

    // ---------- matches ----------
    if (name === 'matchsim') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.id === interaction.user.id) { await interaction.reply({ content: "You can't play yourself.", ephemeral: true }); return; }
      const teamA = getTeam(interaction.user.id), teamB = getTeam(opponent.id);
      if (!teamA || !teamB) { await interaction.reply({ content: 'Both players need a team set (/team set) first.', ephemeral: true }); return; }

      const result = simulateMatch(interaction.user.id, opponent.id);
      const winnerTeam = result.winnerId === interaction.user.id ? teamA : teamB;
      winnerTeam.wins += 1;
      (result.winnerId === interaction.user.id ? teamB : teamA).losses += 1;
      addCoins(result.winnerId, 15);
      saveData(data);

      const embed = new EmbedBuilder()
        .setTitle('⚽ Friendly Match Result')
        .setDescription(matchLine(interaction.user.id, opponent.id, result))
        .addFields({ name: 'Winner', value: winnerTeam.name })
        .setColor(0x2ecc71);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (name === 'predict') {
      const u1 = interaction.options.getUser('team1');
      const u2 = interaction.options.getUser('team2');
      const pick = interaction.options.getUser('pick');
      if (![u1.id, u2.id].includes(pick.id)) { await interaction.reply({ content: 'Your pick has to be one of the two teams.', ephemeral: true }); return; }
      const teamA = getTeam(u1.id), teamB = getTeam(u2.id);
      if (!teamA || !teamB) { await interaction.reply({ content: 'Both teams need to be set first.', ephemeral: true }); return; }

      const result = simulateMatch(u1.id, u2.id);
      const correct = result.winnerId === pick.id;
      if (correct) addCoins(interaction.user.id, 20);
      saveData(data);

      const embed = new EmbedBuilder()
        .setTitle('🔮 Prediction Result')
        .setDescription(`${matchLine(u1.id, u2.id, result)}\n\n${correct ? `✅ Correct! +20 coins` : '❌ Wrong prediction.'}`)
        .setColor(correct ? 0x2ecc71 : 0xe74c3c);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (name === 'penalty') {
      let scored = 0;
      const results = [];
      for (let i = 0; i < 5; i++) {
        const hit = Math.random() < 0.7;
        if (hit) scored++;
        results.push(hit ? '⚽' : '🧤');
      }
      const coinsWon = scored * 10;
      addCoins(interaction.user.id, coinsWon);
      saveData(data);
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('🥅 Penalty Shootout').setDescription(`${results.join(' ')}\n\nScored **${scored}/5**! +${coinsWon} coins.`).setColor(0xf1c40f)],
      });
      return;
    }

    if (name === 'var') {
      const outcome = VAR_OUTCOMES[Math.floor(Math.random() * VAR_OUTCOMES.length)];
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📺 VAR Review').setDescription(outcome).setColor(0x95a5a6)] });
      return;
    }
    if (name === 'card') {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const isRed = Math.random() < 0.2;
      const type = isRed ? 'red' : 'yellow';
      const offense = reason || CARD_QUOTES[type][Math.floor(Math.random() * CARD_QUOTES[type].length)];
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle(`${isRed ? '🟥' : '🟨'} ${isRed ? 'Red' : 'Yellow'} Card!`)
          .setDescription(`${target} has been booked for **${offense}**.${isRed ? ' Off you go! 🚶' : ''}`)
          .setColor(isRed ? 0xe74c3c : 0xf1c40f)],
      });
      return;
    }
    if (name === 'chant') {
      const team = getTeam(interaction.user.id);
      if (!team) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
      const chant = CHANTS[Math.floor(Math.random() * CHANTS.length)].replace(/{team}/g, team.name);
      await interaction.reply(chant);
      return;
    }

    // ---------- shop ----------
    if (name === 'shop') {
      if (sub === 'view') {
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle('🛒 Transfer Market')
            .setDescription(`**starstriker** — ${SHOP_PRICES.starstriker} coins — boosts your goals in your next simulated match`)
            .setColor(0x1abc9c)],
        });
        return;
      }
      if (sub === 'buy') {
        const item = interaction.options.getString('item');
        if (getCoins(interaction.user.id) < SHOP_PRICES[item]) { await interaction.reply({ content: `Need ${SHOP_PRICES[item]} coins.`, ephemeral: true }); return; }
        addCoins(interaction.user.id, -SHOP_PRICES[item]);
        data.boosts[interaction.user.id] = data.boosts[interaction.user.id] || {};
        data.boosts[interaction.user.id].starStriker = true;
        saveData(data);
        await interaction.reply('✅ Star Striker boost active for your next match!');
        return;
      }
    }

    // ---------- tournament ----------
    if (name === 'tournament') {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

      if (sub === 'create') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        if (data.tournament && data.tournament.status !== 'completed') { await interaction.reply({ content: 'A tournament is already active. End it first.', ephemeral: true }); return; }
        const tName = interaction.options.getString('name');
        const size = parseInt(interaction.options.getString('size'), 10);
        const prize = interaction.options.getString('prize');
        const prizeRole = interaction.options.getRole('prize_role');
        data.tournament = { name: tName, size, prize, prizeRoleId: prizeRole?.id || null, status: 'registration', participants: [], rounds: [] };
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
        t.rounds = [buildFirstRound(t.participants)];
        t.status = 'in_progress';
        saveData(data);
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`🏆 ${t.name} — ${roundNameForSize(t.size)} begins!`)
            .setDescription(t.rounds[0].map((m) => `${getTeam(m.p1).name} vs ${getTeam(m.p2).name}`).join('\n'))
            .setColor(0x2ecc71)],
        });
        return;
      }
      if (sub === 'bracket' || sub === 'status') {
        const t = data.tournament;
        if (!t) { await interaction.reply({ content: 'No tournament right now.', ephemeral: true }); return; }
        if (t.status === 'registration') {
          await interaction.reply(`**${t.name}** — Registration: ${t.participants.length}/${t.size} teams joined.`);
          return;
        }
        const currentRound = t.rounds[t.rounds.length - 1];
        const roundSize = currentRound.length * 2;
        const lines = currentRound.map((m) => {
          const p1Name = getTeam(m.p1)?.name || '???';
          const p2Name = getTeam(m.p2)?.name || '???';
          if (m.winner) return `~~${p1Name} vs ${p2Name}~~ → **${getTeam(m.winner).name}**`;
          return `${p1Name} vs ${p2Name}`;
        });
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${t.name} — ${roundNameForSize(roundSize)}`)
          .setDescription(lines.join('\n'))
          .setColor(0x3498db);
        if (t.status === 'completed') embed.setFooter({ text: `Champion: ${getTeam(t.champion)?.name || 'Unknown'}` });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'simulate') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = data.tournament;
        if (!t || t.status !== 'in_progress') { await interaction.reply({ content: 'No tournament in progress.', ephemeral: true }); return; }
        const currentRound = t.rounds[t.rounds.length - 1];
        const resultLines = [];

        for (const match of currentRound) {
          if (match.winner) continue;
          const result = simulateMatch(match.p1, match.p2);
          match.winner = result.winnerId;
          match.result = result;
          resultLines.push(matchLine(match.p1, match.p2, result));
        }

        const winners = currentRound.map((m) => m.winner);
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`⚽ ${t.name} — ${roundNameForSize(currentRound.length * 2)} Results`).setDescription(resultLines.join('\n')).setColor(0x2ecc71)],
        });

        if (winners.length === 1) {
          // Tournament complete
          t.status = 'completed';
          t.champion = winners[0];
          const champTeam = getTeam(winners[0]);
          champTeam.trophies += 1;
          addCoins(winners[0], 200);
          saveData(data);

          if (t.prizeRoleId) {
            const member = await interaction.guild.members.fetch(winners[0]).catch(() => null);
            if (member) await member.roles.add(t.prizeRoleId).catch(() => {});
          }

          await interaction.followUp({
            embeds: [new EmbedBuilder()
              .setTitle(`🏆🎉 ${champTeam.name} WINS ${t.name}!`)
              .setDescription(`Prize: ${t.prize}\n+200 coins awarded.`)
              .setThumbnail(cdnFlag(champTeam.code))
              .setColor(0xffd700)],
          });
        } else {
          t.rounds.push(buildFirstRound(winners));
          saveData(data);
          await interaction.followUp({
            embeds: [new EmbedBuilder().setTitle(`Next round: ${roundNameForSize(winners.length)}`)
              .setDescription(t.rounds[t.rounds.length - 1].map((m) => `${getTeam(m.p1).name} vs ${getTeam(m.p2).name}`).join('\n'))
              .setColor(0x3498db)],
          });
        }
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

client.login(process.env.BOT_TOKEN);
