require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
  SlashCommandBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const GUILD_ID = '1324059331406069872';
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      config: { spawnChannelId: null, forceNextRareSpawn: false, spawnBoostUntil: null, specialBoostUntil: null, disabled: false },
      activeSpawns: {}, // token -> { eventId, claimedBy, channelId, messageId }
      collections: {},     // userId -> { eventId -> { count, level, var1, var2, power } }
      bux: {},              // userId -> number (currency, replaces old upgrade points)
      battleStats: {},
      favorites: {},        // userId -> [eventId]
      lastCaught: {},        // userId -> eventId
      catchphrases: {},      // userId -> string
      guaranteeRarity: {},   // userId -> rarity name
      rarityBoostUntil: {},  // userId -> timestamp
      lastDaily: {},
      customEvents: {},      // eventId -> event object (admin-created)
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.config ??= {};
  parsed.config.spawnChannelId ??= null;
  parsed.config.forceNextRareSpawn ??= false;
  parsed.config.spawnBoostUntil ??= null;
  parsed.config.specialBoostUntil ??= null;
  parsed.config.disabled ??= false;
  parsed.activeSpawns ??= {};
  parsed.collections ??= {};
  parsed.bux ??= {};
  parsed.battleStats ??= {};
  parsed.favorites ??= {};
  parsed.lastCaught ??= {};
  parsed.catchphrases ??= {};
  parsed.guaranteeRarity ??= {};
  parsed.rarityBoostUntil ??= {};
  parsed.lastDaily ??= {};
  parsed.customEvents ??= {};
  return parsed;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let data = loadData();

// ============================================================
// RARITY TIERS
// ============================================================
const RARITY_TIERS = [
  { name: 'Copper', frame: '🟤', weight: 40, color: 0xb87333, multiplier: 1 },
  { name: 'Iron', frame: '⚙️', weight: 25, color: 0x43464b, multiplier: 1.3 },
  { name: 'Bronze', frame: '🥉', weight: 16, color: 0xcd7f32, multiplier: 1.7 },
  { name: 'Gold', frame: '🥇', weight: 10, color: 0xffd700, multiplier: 2.3 },
  { name: 'Diamond', frame: '💎', weight: 5, color: 0xb9f2ff, multiplier: 3.2 },
  { name: 'Emerald', frame: '💚', weight: 2.5, color: 0x50c878, multiplier: 4.5 },
  { name: 'Sapphire', frame: '🔷', weight: 1.2, color: 0x0f52ba, multiplier: 6 },
  { name: 'Mythic', frame: '🔮', weight: 0.25, color: 0xff00ff, multiplier: 9 },
  { name: 'Legendary', frame: '👑', weight: 0.05, color: 0xffa500, multiplier: 14 },
];
function getRarity(name) {
  return RARITY_TIERS.find((r) => r.name === name);
}
function rarityIndex(name) {
  return RARITY_TIERS.findIndex((r) => r.name === name);
}

// ============================================================
// REAL FLAG IMAGES — raster PNGs (Discord embeds do not render SVG,
// which is why nothing showed before). flagcdn.com is a public,
// hotlink-friendly flag CDN using ISO country codes. The Roman Empire
// has no ISO code, so it uses its real vexilloid via Wikimedia's
// SVG-to-PNG thumbnail conversion (the ?width= param forces a raster
// render instead of serving the raw, unrenderable SVG).
// ============================================================
function cdnFlag(code) {
  return `https://flagcdn.com/w320/${code}.png`;
}
function wikiRaster(filename, width = 400) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=${width}`;
}
const FLAGS = {
  rome: wikiRaster('Vexilloid of the Roman Empire.svg'),
  carthage: cdnFlag('tn'),
  egypt_ancient: cdnFlag('eg'),
  uk: cdnFlag('gb'),
  france: cdnFlag('fr'),
  spain: cdnFlag('es'),
  germany: cdnFlag('de'),
  russia: cdnFlag('ru'),
  us: cdnFlag('us'),
  southkorea: cdnFlag('kr'),
  turkey: cdnFlag('tr'),
  vatican: cdnFlag('va'),
  iraq: cdnFlag('iq'),
  japan: cdnFlag('jp'),
  vietnam: cdnFlag('vn'),
  argentina: cdnFlag('ar'),
  israel: cdnFlag('il'),
  iran: cdnFlag('ir'),
  mexico: cdnFlag('mx'),
  southafrica: cdnFlag('za'),
  china: cdnFlag('cn'),
  finland: cdnFlag('fi'),
  afghanistan: cdnFlag('af'),
};

// ============================================================
// HISTORICAL EVENT POOL
// ============================================================
const HISTORICAL_EVENTS = [
  { id: 'napoleonic-wars', name: 'The Napoleonic Wars', era: '1803–1815', rarity: 'Diamond', flagA: 'france', flagB: 'uk',
    aliases: ['napoleonic wars', 'the napoleonic wars'] },
  { id: 'american-civil-war', name: 'The American Civil War', era: '1861–1865', rarity: 'Gold', flagA: 'us', flagB: null,
    aliases: ['american civil war', 'the american civil war', 'civil war'] },
  { id: 'franco-prussian-war', name: 'The Franco-Prussian War', era: '1870–1871', rarity: 'Bronze', flagA: 'france', flagB: 'germany',
    aliases: ['franco prussian war', 'franco-prussian war'] },
  { id: 'spanish-american-war', name: 'The Spanish–American War', era: '1898', rarity: 'Bronze', flagA: 'spain', flagB: 'us',
    aliases: ['spanish american war', 'the spanish-american war', 'spanish-american war'] },
  { id: 'russo-japanese-war', name: 'The Russo-Japanese War', era: '1904–1905', rarity: 'Bronze', flagA: 'russia', flagB: 'japan',
    aliases: ['russo japanese war', 'russo-japanese war'] },
  { id: 'world-war-1', name: 'World War I', era: '1914–1918', rarity: 'Legendary', flagA: 'germany', flagB: 'uk',
    aliases: ['world war 1', 'world war i', 'wwi', 'the great war', 'first world war'] },
  { id: 'world-war-2', name: 'World War II', era: '1939–1945', rarity: 'Legendary', flagA: 'germany', flagB: 'us',
    aliases: ['world war 2', 'world war ii', 'wwii', 'second world war'] },
  { id: 'korean-war', name: 'The Korean War', era: '1950–1953', rarity: 'Gold', flagA: 'southkorea', flagB: 'us',
    aliases: ['korean war', 'the korean war'] },
  { id: 'vietnam-war', name: 'The Vietnam War', era: '1955–1975', rarity: 'Gold', flagA: 'vietnam', flagB: 'us',
    aliases: ['vietnam war', 'the vietnam war'] },
  { id: 'yom-kippur-war', name: 'The Yom Kippur War', era: '1973', rarity: 'Sapphire', flagA: 'israel', flagB: 'egypt_ancient',
    aliases: ['yom kippur war', 'the yom kippur war', 'october war'] },
  { id: 'falklands-war', name: 'The Falklands War', era: '1982', rarity: 'Bronze', flagA: 'uk', flagB: 'argentina',
    aliases: ['falklands war', 'the falklands war'] },
  { id: 'iran-iraq-war', name: 'The Iran-Iraq War', era: '1980–1988', rarity: 'Sapphire', flagA: 'iran', flagB: 'iraq',
    aliases: ['iran iraq war', 'iran-iraq war'] },
  { id: 'gulf-war', name: 'The Gulf War', era: '1990–1991', rarity: 'Bronze', flagA: 'iraq', flagB: 'us',
    aliases: ['gulf war', 'the gulf war', 'operation desert storm'] },
  { id: 'mexican-american-war', name: 'The Mexican-American War', era: '1846–1848', rarity: 'Bronze', flagA: 'us', flagB: 'mexico',
    aliases: ['mexican american war', 'mexican-american war'] },
  { id: 'russo-turkish-war', name: 'The Russo-Turkish War', era: '1877–1878', rarity: 'Iron', flagA: 'russia', flagB: 'turkey',
    aliases: ['russo turkish war', 'russo-turkish war'] },
  { id: 'second-boer-war', name: 'The Second Boer War', era: '1899–1902', rarity: 'Bronze', flagA: 'uk', flagB: 'southafrica',
    aliases: ['second boer war', 'boer war', 'the second boer war'] },
  { id: 'first-sino-japanese-war', name: 'The First Sino-Japanese War', era: '1894–1895', rarity: 'Iron', flagA: 'china', flagB: 'japan',
    aliases: ['first sino japanese war', 'sino japanese war', 'first sino-japanese war'] },
  { id: 'spanish-civil-war', name: 'The Spanish Civil War', era: '1936–1939', rarity: 'Gold', flagA: 'spain', flagB: null,
    aliases: ['spanish civil war', 'the spanish civil war'] },
  { id: 'winter-war', name: 'The Winter War', era: '1939–1940', rarity: 'Sapphire', flagA: 'finland', flagB: 'russia',
    aliases: ['winter war', 'the winter war'] },
  { id: 'six-day-war', name: 'The Six-Day War', era: '1967', rarity: 'Sapphire', flagA: 'israel', flagB: 'egypt_ancient',
    aliases: ['six day war', 'the six-day war', 'six-day war'] },
  { id: 'soviet-afghan-war', name: 'The Soviet-Afghan War', era: '1979–1989', rarity: 'Gold', flagA: 'russia', flagB: 'afghanistan',
    aliases: ['soviet afghan war', 'soviet-afghan war'] },
];
function allEvents() {
  return [...HISTORICAL_EVENTS, ...Object.values(data.customEvents)];
}
function findEventById(id) {
  return allEvents().find((e) => e.id === id);
}
function findEventByName(name) {
  const norm = name.trim().toLowerCase();
  return allEvents().find((e) => e.name.toLowerCase() === norm || e.aliases.includes(norm));
}
function matchesEvent(event, guess) {
  const norm = guess.trim().toLowerCase();
  return event.name.toLowerCase() === norm || event.aliases.includes(norm);
}

// ---------- Bux (currency) helpers ----------
function getBux(userId) { return data.bux[userId] || 0; }
function addBux(userId, amount) { data.bux[userId] = Math.max(0, (data.bux[userId] || 0) + amount); }

// ---------- Collection helpers ----------
function getCollection(userId) {
  data.collections[userId] = data.collections[userId] || {};
  return data.collections[userId];
}
function computeBasePower(rarity, var1, var2) {
  return Math.round(50 * rarity.multiplier * (1 + var1 / 100) * (1 + var2 / 100));
}
function recomputePower(entry, rarity) {
  const base = computeBasePower(rarity, entry.var1, entry.var2);
  entry.power = base + (entry.level - 1) * Math.round(rarity.multiplier * 5);
}
function rollVariance() {
  // -20 to +20, whole numbers only — matches the "-15%/+7%" reference format
  return Math.round(Math.random() * 40 - 20);
}
function grantEvent(userId, eventId) {
  const event = findEventById(eventId);
  let rarity = getRarity(event.rarity);

  // Guarantee token: if active and higher than the natural rarity, upgrade the catch's quality
  const guaranteed = data.guaranteeRarity[userId];
  if (guaranteed && rarityIndex(guaranteed) > rarityIndex(rarity.name)) {
    rarity = getRarity(guaranteed);
    delete data.guaranteeRarity[userId];
  } else if (guaranteed) {
    delete data.guaranteeRarity[userId]; // consumed regardless once used on a catch
  }

  // Rarity boost: flat chance to bump one tier
  const boostUntil = data.rarityBoostUntil[userId];
  if (boostUntil && Date.now() < boostUntil && Math.random() < 0.15) {
    const idx = Math.min(rarityIndex(rarity.name) + 1, RARITY_TIERS.length - 1);
    rarity = RARITY_TIERS[idx];
  }

  const var1 = rollVariance();
  const var2 = rollVariance();
  const collection = getCollection(userId);
  data.lastCaught[userId] = eventId;

  if (collection[eventId]) {
    collection[eventId].count += 1;
    addBux(userId, 5);
    saveData(data);
    return { isNew: false, entry: collection[eventId], rarity, var1, var2 };
  }
  const entry = { count: 1, level: 1, var1, var2, power: 0, caughtAt: Date.now() };
  recomputePower(entry, rarity);
  collection[eventId] = entry;
  saveData(data);
  return { isNew: true, entry, rarity, var1, var2 };
}

// ---------- Weighted random event selection ----------
function pickWeightedEvent() {
  if (data.config.forceNextRareSpawn) {
    data.config.forceNextRareSpawn = false;
    saveData(data);
    const rareOnly = HISTORICAL_EVENTS.filter((e) => rarityIndex(e.rarity) >= rarityIndex('Gold'));
    return rareOnly[Math.floor(Math.random() * rareOnly.length)];
  }
  const specialBoostActive = data.config.specialBoostUntil && Date.now() < data.config.specialBoostUntil;
  const customList = Object.values(data.customEvents);
  const weighted = [
    ...HISTORICAL_EVENTS.map((e) => ({ event: e, weight: getRarity(e.rarity).weight })),
    // Custom admin-created events are always rare inserts — a tiny weight so they
    // show up only occasionally, boosted temporarily by the specialboost shop item.
    ...customList.map((e) => ({ event: e, weight: (specialBoostActive ? 5 : 1) * 0.4 })),
  ];
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.event;
  }
  return weighted[weighted.length - 1].event;
}

// ============================================================
// SPAWNING — fixed 30-minute cadence (temporarily halved by spawnboost)
// ============================================================
const SPAWN_INTERVAL_MS = 30 * 60 * 1000;

function buildSpawnEmbed(event) {
  const flagA = event.flagA ? FLAGS[event.flagA] : null;
  const flagB = event.flagB ? FLAGS[event.flagB] : null;
  const embed = new EmbedBuilder()
    .setTitle('A wild historyball appeared!')
    .setDescription(`**Era:** ${event.era}\n\nGuess the war behind these flags!`)
    .setColor(0x2c3e50)
    .setFooter({ text: 'First correct guess claims it for their collection.' });
  if (flagA) embed.setImage(flagA);
  if (flagB) embed.setThumbnail(flagB);
  return embed;
}

async function spawnEvent(guild, forcedEvent = null, overrideChannelId = null) {
  const channelId = overrideChannelId || data.config.spawnChannelId;
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return null;

  const event = forcedEvent || pickWeightedEvent();
  const token = `${Date.now()}${Math.floor(Math.random() * 100000)}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guess_${token}`).setLabel('Catch me').setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({ embeds: [buildSpawnEmbed(event)], components: [row] }).catch(() => null);
  if (!message) return null;

  data.activeSpawns[token] = { eventId: event.id, claimedBy: null, channelId, messageId: message.id };
  saveData(data);
  return token;
}

function scheduleNextSpawn(guild) {
  const boostActive = data.config.spawnBoostUntil && Date.now() < data.config.spawnBoostUntil;
  const gap = boostActive ? SPAWN_INTERVAL_MS / 2 : SPAWN_INTERVAL_MS;
  setTimeout(async () => {
    if (!(data.config.disabled)) await spawnEvent(guild);
    scheduleNextSpawn(guild);
  }, gap);
}

async function claimSpawn(interaction, token, guessText) {
  const spawn = data.activeSpawns[token];
  if (!spawn || spawn.claimedBy) return { correct: false, alreadyClaimed: true };
  const event = findEventById(spawn.eventId);
  if (!matchesEvent(event, guessText)) return { correct: false, alreadyClaimed: false };

  spawn.claimedBy = interaction.user.id;
  const result = grantEvent(interaction.user.id, event.id);
  saveData(data);

  const channel = interaction.guild.channels.cache.get(spawn.channelId);
  const spawnMessage = channel ? await channel.messages.fetch(spawn.messageId).catch(() => null) : null;
  if (spawnMessage) {
    const claimedEmbed = EmbedBuilder.from(spawnMessage.embeds[0])
      .setTitle(`${result.rarity.frame} ${event.name} — Claimed!`)
      .setDescription(`**Era:** ${event.era}\n\nClaimed by ${interaction.user}!`);
    await spawnMessage.edit({ embeds: [claimedEmbed], components: [] }).catch(() => {});
  }

  delete data.activeSpawns[token];
  saveData(data);
  return { correct: true, event, ...result };
}

// Generates the "(#6FA1EAB, -15%/+7%)" style catch-id + stat suffix
function catchIdSuffix(var1, var2) {
  const id = Math.floor(Math.random() * 0xffffff).toString(16).toUpperCase().padStart(6, '0');
  const s1 = var1 >= 0 ? `+${var1}` : `${var1}`;
  const s2 = var2 >= 0 ? `+${var2}` : `${var2}`;
  return `#${id}, ${s1}%/${s2}%`;
}

// ============================================================
// FAKE CHAT — a stylized, templated "group chat" bit about a war topic.
// Templated rather than AI-generated so nothing unpredictable gets posted;
// swap in a real LLM call here later if you want fully dynamic lines.
// ============================================================
const FAKE_USERNAMES = [
  'HistoryNerd42', 'CasualGamer99', 'TeaEnjoyer', 'QuizWhizz',
  'LurkerLarry', 'MapObsessed', 'DocumentaryFan', 'JustHereForTrivia',
];
const FAKE_CHAT_LINES = [
  "wait {topic} was actually WILD",
  "didn't we juuust learn about {topic} in school 💀",
  "{topic} lowkey changed everything ngl",
  "anyone else oddly obsessed with {topic} rn",
  "{topic} enjoyers rise up 🙌",
  "ngl I still don't fully get {topic} but I nod along",
  "{topic} but as a Netflix series when",
  "the way {topic} escalated so fast is insane",
  "my grandpa still talks about {topic} 😭",
  "{topic} deserves more attention fr",
  "just watched a 3 hour documentary on {topic}, ask me anything",
  "{topic} is criminally underrated as a topic",
  "someone explain {topic} to me like I'm 5",
  "{topic} hits different once you know the backstory",
];
function generateFakeChat(topicName) {
  const shuffledUsers = [...FAKE_USERNAMES].sort(() => Math.random() - 0.5);
  const lineCount = 6 + Math.floor(Math.random() * 3); // 6-8 lines
  const usedLines = [...FAKE_CHAT_LINES].sort(() => Math.random() - 0.5).slice(0, lineCount);
  const lines = usedLines.map((line, i) => {
    const user = shuffledUsers[i % shuffledUsers.length];
    return `**${user}:** ${line.replace(/{topic}/g, topicName)}`;
  });
  return lines.join('\n');
}

// ============================================================
// SLASH COMMAND DEFINITIONS
// ============================================================
const shopChoices = ['view', 'catchphrase', 'guarantee', 'rarespawn', 'rarityboost', 'reroll', 'spawnboost', 'specialboost'];
const rarityChoices = RARITY_TIERS.map((r) => ({ name: r.name, value: r.name }));

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),

  new SlashCommandBuilder().setName('historychat').setDescription('Generate a fake group chat about a historical war.')
    .addStringOption((o) => o.setName('topic').setDescription('War to discuss — leave blank for a random one').setRequired(false).setAutocomplete(true)),

  new SlashCommandBuilder().setName('history').setDescription('Historydex collection commands.')
    .addSubcommand((s) => s.setName('count').setDescription('Count how many events you have.'))
    .addSubcommand((s) => s.setName('drop').setDescription('Drop (delete) one copy of an event.')
      .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
    .addSubcommand((s) => s.setName('favorite').setDescription('Toggle favorite on an event.')
      .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
    .addSubcommand((s) => s.setName('give').setDescription('Give one copy of an event to another user.')
      .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
      .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
    .addSubcommand((s) => s.setName('last').setDescription('Show the most recently caught event.')
      .addUserOption((o) => o.setName('user').setDescription('Whose last catch').setRequired(false)))
    .addSubcommand((s) => s.setName('info').setDescription("Show one event's details.")
      .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
    .addSubcommand((s) => s.setName('bulk_give').setDescription('Give multiple events to a user at once.')
      .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
      .addStringOption((o) => o.setName('events').setDescription('Comma-separated event names').setRequired(true)))
    .addSubcommand((s) => s.setName('collection').setDescription('View a full collection grouped by rarity.')
      .addUserOption((o) => o.setName('user').setDescription('Whose collection').setRequired(false)))
    .addSubcommand((s) => s.setName('completion').setDescription('View completion percentage.')
      .addUserOption((o) => o.setName('user').setDescription('Whose progress').setRequired(false)))
    .addSubcommand((s) => s.setName('list').setDescription('List owned events with sort/filter options.')
      .addUserOption((o) => o.setName('user').setDescription('Whose list').setRequired(false))
      .addStringOption((o) => o.setName('sort').setDescription('How to sort').setRequired(false)
        .addChoices(
          { name: 'alphabetic', value: 'alphabetic' },
          { name: 'catch_date', value: 'catch_date' },
          { name: 'rarity', value: 'rarity' },
          { name: 'power', value: 'power' },
        ))
      .addBooleanOption((o) => o.setName('reverse').setDescription('Reverse the sort order').setRequired(false))
      .addStringOption((o) => o.setName('filter').setDescription('Only show events whose name contains this text').setRequired(false))
      .addStringOption((o) => o.setName('rarity').setDescription('Only show this rarity tier').setRequired(false).addChoices(...rarityChoices))
      .addBooleanOption((o) => o.setName('group').setDescription('Group results by rarity tier').setRequired(false)))
    .addSubcommand((s) => s.setName('compare').setDescription('Compare two of your events.')
      .addStringOption((o) => o.setName('event_a').setDescription('First event').setRequired(true))
      .addStringOption((o) => o.setName('event_b').setDescription('Second event').setRequired(true)))
    .addSubcommand((s) => s.setName('duplicate').setDescription('Show events you own more than one of.')),

  new SlashCommandBuilder().setName('historybux').setDescription('Historydex currency & shop.')
    .addSubcommand((s) => s.setName('balance').setDescription('Check your bux balance.'))
    .addSubcommand((s) => s.setName('daily').setDescription('Claim your daily bux.'))
    .addSubcommand((s) => s.setName('give').setDescription('Give bux to another player.')
      .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMinValue(1)))
    .addSubcommand((s) => s.setName('sell').setDescription('Sell one copy of an event for bux.')
      .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
    .addSubcommandGroup((g) => g.setName('shop').setDescription('Shop items.')
      .addSubcommand((s) => s.setName('view').setDescription('See what the shop sells and prices.'))
      .addSubcommand((s) => s.setName('catchphrase').setDescription('Buy a custom catch phrase.')
        .addStringOption((o) => o.setName('phrase').setDescription('Your custom phrase').setRequired(true)))
      .addSubcommand((s) => s.setName('guarantee').setDescription('Guarantee your next catch is at least a given rarity.')
        .addStringOption((o) => o.setName('rarity').setDescription('Minimum rarity').setRequired(true).addChoices(...rarityChoices)))
      .addSubcommand((s) => s.setName('rarespawn').setDescription('Make the next spawn in this server Gold rarity or better.'))
      .addSubcommand((s) => s.setName('rarityboost').setDescription('Boost your own chance of a rarity upgrade on catches (2 hours).'))
      .addSubcommand((s) => s.setName('reroll').setDescription('Reroll the stat bonuses of one of your events.')
        .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)))
      .addSubcommand((s) => s.setName('spawnboost').setDescription('Halve the spawn interval server-wide for 2 hours.'))
      .addSubcommand((s) => s.setName('specialboost').setDescription('Boost the chance of rare special events spawning for 2 hours.'))),

  new SlashCommandBuilder().setName('historyadmin').setDescription('Admin tools. Admin only.')
    .addSubcommand((s) => s.setName('setspawnchannel').setDescription('Set where events spawn.')
      .addChannelOption((o) => o.setName('channel').setDescription('Spawn channel').setRequired(true)))
    .addSubcommand((s) => s.setName('forcespawn').setDescription('Spawn one random event right now.'))
    .addSubcommand((s) => s.setName('spawn').setDescription('Spawn a specific event (searchable) — up to 50 at once.')
      .addStringOption((o) => o.setName('event').setDescription('Search by name — leave blank for random').setRequired(false).setAutocomplete(true))
      .addIntegerOption((o) => o.setName('count').setDescription('How many to spawn (1-50, default 1)').setRequired(false).setMinValue(1).setMaxValue(50)))
    .addSubcommand((s) => s.setName('createevent').setDescription('Create a custom rare special event.')
      .addStringOption((o) => o.setName('name').setDescription('Event name').setRequired(true))
      .addStringOption((o) => o.setName('era').setDescription('Era / date description').setRequired(true))
      .addStringOption((o) => o.setName('aliases').setDescription('Comma-separated accepted answers').setRequired(true))
      .addStringOption((o) => o.setName('rarity').setDescription('Rarity tier').setRequired(true).addChoices(...rarityChoices))
      .addStringOption((o) => o.setName('flag_a').setDescription('Flag key (see /historyadmin listevents for options)').setRequired(false))
      .addStringOption((o) => o.setName('flag_b').setDescription('Second flag key').setRequired(false)))
    .addSubcommand((s) => s.setName('listevents').setDescription('List all custom special events.'))
    .addSubcommand((s) => s.setName('runevent').setDescription('Force-spawn a specific stored custom event now.')
      .addStringOption((o) => o.setName('name').setDescription('Custom event name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('deleteevent').setDescription('Delete a custom event permanently.')
      .addStringOption((o) => o.setName('name').setDescription('Custom event name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('status').setDescription('Check server configuration status.'))
    .addSubcommand((s) => s.setName('disable').setDescription('Enable or disable automatic spawning.')
      .addBooleanOption((o) => o.setName('disabled').setDescription('True to disable spawning').setRequired(true))),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
  if (guild) scheduleNextSpawn(guild);
});

// ============================================================
// SHOP PRICES
// ============================================================
const SHOP_PRICES = {
  catchphrase: 50,
  guaranteeBase: 40, // multiplied by (rarity index + 1)
  rarespawn: 150,
  rarityboost: 60,
  reroll: 30,
  spawnboost: 100,
  specialboost: 120,
};
const DAILY_AMOUNT = 20;
const BOOST_DURATION_MS = 2 * 60 * 60 * 1000;

// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ---------- Autocomplete ----------
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      const query = focused.value.toLowerCase();

      if (interaction.commandName === 'historychat' && focused.name === 'topic') {
        const matches = HISTORICAL_EVENTS
          .filter((e) => e.name.toLowerCase().includes(query))
          .slice(0, 25)
          .map((e) => ({ name: e.name, value: e.id }));
        await interaction.respond(matches);
        return;
      }
      if (interaction.commandName !== 'historyadmin') { await interaction.respond([]); return; }

      if (focused.name === 'event') {
        const matches = allEvents()
          .filter((e) => e.name.toLowerCase().includes(query))
          .slice(0, 25)
          .map((e) => ({ name: `${e.name} (${e.rarity})`, value: e.id }));
        await interaction.respond(matches);
        return;
      }
      if (focused.name === 'name') {
        const matches = Object.values(data.customEvents)
          .filter((e) => e.name.toLowerCase().includes(query))
          .slice(0, 25)
          .map((e) => ({ name: `${e.name} (${e.rarity})`, value: e.name }));
        await interaction.respond(matches);
        return;
      }
      await interaction.respond([]);
      return;
    }

    // ---------- Button: opens the guess modal ----------
    if (interaction.isButton() && interaction.customId.startsWith('guess_')) {
      const token = interaction.customId.replace('guess_', '');
      const spawn = data.activeSpawns[token];
      if (!spawn) {
        await interaction.reply({ content: 'This spawn has expired.', ephemeral: true });
        return;
      }
      if (spawn.claimedBy) {
        await interaction.reply({ content: 'This one has already been claimed!', ephemeral: true });
        return;
      }
      const modal = new ModalBuilder().setCustomId(`guessmodal_${token}`).setTitle('Catch This Historyball');
      const input = new TextInputBuilder()
        .setCustomId('guessInput').setLabel('War, treaty, or event name')
        .setStyle(TextInputStyle.Short).setPlaceholder('e.g. World War II').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ---------- Modal submit: check the guess ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('guessmodal_')) {
      const token = interaction.customId.replace('guessmodal_', '');
      const guessText = interaction.fields.getTextInputValue('guessInput');
      const result = await claimSpawn(interaction, token, guessText);

      if (result.alreadyClaimed) {
        await interaction.reply({ content: 'Too slow — someone already claimed this one!', ephemeral: true });
        return;
      }
      if (!result.correct) {
        await interaction.reply({ content: '❌ Not quite. Try again!', ephemeral: true });
        return;
      }
      const suffix = catchIdSuffix(result.var1, result.var2);
      const phrase = data.catchphrases[interaction.user.id];
      let content = `${interaction.user} You caught **${result.event.name}**! (${suffix})`;
      if (phrase) content += `\n*${phrase}*`;
      if (!result.isNew) content += `\n(You already had this one — converted to +5 bux instead.)`;
      await interaction.reply(content);
      return;
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    const name = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);
    const group = interaction.options.getSubcommandGroup(false);

    // ---------- /help ----------
    if (name === 'help') {
      const out = '```\n' +
        'HISTORYDEX COMMANDS:\n' +
        '/historychat: generate a fake group chat about a war\n' +
        '/history: count, drop, favorite, give, last, info,\n' +
        '          bulk_give, collection, completion, list,\n' +
        '          compare, duplicate\n' +
        '/historybux: balance, daily, give, sell,\n' +
        '             shop view/catchphrase/guarantee/rarespawn/\n' +
        '             rarityboost/reroll/spawnboost/specialboost\n' +
        '/historyadmin: setspawnchannel, forcespawn, spawn,\n' +
        '               createevent, listevents, runevent,\n' +
        '               deleteevent, status, disable\n' +
        '```';
      await interaction.reply({ content: out, ephemeral: true });
      return;
    }

    // ---------- /historychat ----------
    if (name === 'historychat') {
      const topicId = interaction.options.getString('topic');
      const topicEvent = topicId ? findEventById(topicId) : null;
      const topicName = topicEvent ? topicEvent.name : HISTORICAL_EVENTS[Math.floor(Math.random() * HISTORICAL_EVENTS.length)].name;

      const embed = new EmbedBuilder()
        .setTitle(`💬 #${topicName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
        .setDescription(generateFakeChat(topicName))
        .setColor(0x5865f2)
        .setFooter({ text: 'Historydex — simulated chat, not real messages' });
      await interaction.reply({ embeds: [embed] });
      return;
    }

    // ============================================================
    // /history ...
    // ============================================================
    if (name === 'history') {
      const userId = interaction.user.id;

      if (sub === 'count') {
        const collection = getCollection(userId);
        const total = Object.values(collection).reduce((s, e) => s + e.count, 0);
        await interaction.reply(`You have **${Object.keys(collection).length}** unique events, **${total}** total copies.`);
        return;
      }
      if (sub === 'drop') {
        const event = findEventByName(interaction.options.getString('event'));
        const entry = event && getCollection(userId)[event.id];
        if (!entry) { await interaction.reply({ content: "You don't own that event.", ephemeral: true }); return; }
        entry.count -= 1;
        if (entry.count <= 0) delete data.collections[userId][event.id];
        saveData(data);
        await interaction.reply(`🗑️ Dropped one copy of **${event.name}**.`);
        return;
      }
      if (sub === 'favorite') {
        const event = findEventByName(interaction.options.getString('event'));
        if (!event || !getCollection(userId)[event.id]) { await interaction.reply({ content: "You don't own that event.", ephemeral: true }); return; }
        data.favorites[userId] = data.favorites[userId] || [];
        const idx = data.favorites[userId].indexOf(event.id);
        if (idx >= 0) { data.favorites[userId].splice(idx, 1); saveData(data); await interaction.reply(`💔 Removed **${event.name}** from favorites.`); }
        else { data.favorites[userId].push(event.id); saveData(data); await interaction.reply(`⭐ Added **${event.name}** to favorites.`); }
        return;
      }
      if (sub === 'give') {
        const target = interaction.options.getUser('user');
        const event = findEventByName(interaction.options.getString('event'));
        const entry = event && getCollection(userId)[event.id];
        if (!entry) { await interaction.reply({ content: "You don't own that event.", ephemeral: true }); return; }
        entry.count -= 1;
        if (entry.count <= 0) delete data.collections[userId][event.id];
        const targetCollection = getCollection(target.id);
        if (targetCollection[event.id]) targetCollection[event.id].count += 1;
        else targetCollection[event.id] = { count: 1, level: 1, var1: 0, var2: 0, power: computeBasePower(getRarity(event.rarity), 0, 0) };
        saveData(data);
        await interaction.reply(`🎁 Gave **${event.name}** to ${target}.`);
        return;
      }
      if (sub === 'last') {
        const target = interaction.options.getUser('user') || interaction.user;
        const eventId = data.lastCaught[target.id];
        const event = eventId && findEventById(eventId);
        if (!event) { await interaction.reply(`${target.username} hasn't caught anything yet.`); return; }
        await interaction.reply(`${target.username}'s last catch: **${event.name}**`);
        return;
      }
      if (sub === 'info') {
        const event = findEventByName(interaction.options.getString('event'));
        if (!event) { await interaction.reply({ content: 'No event found with that name.', ephemeral: true }); return; }
        const entry = getCollection(userId)[event.id];
        const rarity = getRarity(event.rarity);
        const embed = new EmbedBuilder().setTitle(`${rarity.frame} ${event.name}`).setDescription(`**Era:** ${event.era}\n**Rarity:** ${rarity.name}`).setColor(rarity.color);
        if (event.flagA) embed.setImage(FLAGS[event.flagA]);
        if (event.flagB) embed.setThumbnail(FLAGS[event.flagB]);
        if (entry) {
          embed.addFields(
            { name: 'Owned', value: `x${entry.count}`, inline: true },
            { name: 'Level', value: `${entry.level}`, inline: true },
            { name: 'Power', value: `${entry.power}`, inline: true },
            { name: 'Stats', value: `${entry.var1 >= 0 ? '+' : ''}${entry.var1}% / ${entry.var2 >= 0 ? '+' : ''}${entry.var2}%`, inline: true },
          );
        } else {
          embed.addFields({ name: 'Status', value: "You haven't collected this one yet." });
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'bulk_give') {
        const target = interaction.options.getUser('user');
        const names = interaction.options.getString('events').split(',').map((s) => s.trim());
        const results = [];
        for (const n of names) {
          const event = findEventByName(n);
          const entry = event && getCollection(userId)[event.id];
          if (!entry) { results.push(`${n} — not owned, skipped`); continue; }
          entry.count -= 1;
          if (entry.count <= 0) delete data.collections[userId][event.id];
          const targetCollection = getCollection(target.id);
          if (targetCollection[event.id]) targetCollection[event.id].count += 1;
          else targetCollection[event.id] = { count: 1, level: 1, var1: 0, var2: 0, power: computeBasePower(getRarity(event.rarity), 0, 0) };
          results.push(`${event.name} — given`);
        }
        saveData(data);
        await interaction.reply(`**Bulk give to ${target.username}:**\n${results.join('\n')}`);
        return;
      }
      if (sub === 'collection') {
        const target = interaction.options.getUser('user') || interaction.user;
        const collection = getCollection(target.id);
        const entries = Object.entries(collection);
        if (entries.length === 0) { await interaction.reply(`${target.username} hasn't collected any historical events yet.`); return; }
        const grouped = {};
        for (const tier of RARITY_TIERS) grouped[tier.name] = [];
        for (const [eventId, entry] of entries) {
          const event = findEventById(eventId);
          if (!event) continue;
          const fav = (data.favorites[target.id] || []).includes(eventId) ? '⭐ ' : '';
          grouped[event.rarity].push(`${fav}${event.name} — Lv.${entry.level} (Power ${entry.power})${entry.count > 1 ? ` x${entry.count}` : ''}`);
        }
        const embed = new EmbedBuilder().setTitle(`📚 ${target.username}'s Collection`).setColor(0x5865f2)
          .setFooter({ text: `${entries.length}/${allEvents().length} unique events collected` });
        for (const tier of [...RARITY_TIERS].reverse()) if (grouped[tier.name].length) embed.addFields({ name: `${tier.frame} ${tier.name}`, value: grouped[tier.name].join('\n') });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'completion') {
        const target = interaction.options.getUser('user') || interaction.user;
        const collection = getCollection(target.id);
        const owned = Object.keys(collection).length;
        const total = allEvents().length;
        const pct = Math.round((owned / total) * 100);
        await interaction.reply(`📊 ${target.username}: **${owned}/${total} (${pct}%)** discovered.`);
        return;
      }
      if (sub === 'list') {
        const target = interaction.options.getUser('user') || interaction.user;
        const sortBy = interaction.options.getString('sort') || 'alphabetic';
        const reverse = interaction.options.getBoolean('reverse') || false;
        const filterText = interaction.options.getString('filter')?.toLowerCase();
        const rarityFilter = interaction.options.getString('rarity');
        const groupByRarity = interaction.options.getBoolean('group') || false;

        const collection = getCollection(target.id);
        let rows = Object.entries(collection).map(([id, e]) => ({ id, event: findEventById(id), entry: e })).filter((r) => r.event);

        if (filterText) rows = rows.filter((r) => r.event.name.toLowerCase().includes(filterText));
        if (rarityFilter) rows = rows.filter((r) => r.event.rarity === rarityFilter);

        const sorters = {
          alphabetic: (a, b) => a.event.name.localeCompare(b.event.name),
          catch_date: (a, b) => (a.entry.caughtAt || 0) - (b.entry.caughtAt || 0),
          rarity: (a, b) => rarityIndex(a.event.rarity) - rarityIndex(b.event.rarity),
          power: (a, b) => a.entry.power - b.entry.power,
        };
        rows.sort(sorters[sortBy] || sorters.alphabetic);
        if (reverse) rows.reverse();

        if (rows.length === 0) { await interaction.reply(`${target.username} owns nothing matching those filters.`); return; }

        if (groupByRarity) {
          const grouped = {};
          for (const tier of RARITY_TIERS) grouped[tier.name] = [];
          for (const r of rows) grouped[r.event.rarity].push(`${r.event.name} (Lv.${r.entry.level}, Power ${r.entry.power})`);
          const embed = new EmbedBuilder().setTitle(`${target.username}'s List`).setColor(0x5865f2);
          for (const tier of [...RARITY_TIERS].reverse()) if (grouped[tier.name].length) embed.addFields({ name: `${tier.frame} ${tier.name}`, value: grouped[tier.name].join('\n') });
          await interaction.reply({ embeds: [embed] });
          return;
        }

        const lines = rows.map((r) => `${getRarity(r.event.rarity).frame} ${r.event.name} (Lv.${r.entry.level}, Power ${r.entry.power})`);
        await interaction.reply(lines.join('\n').slice(0, 1900));
        return;
      }
      if (sub === 'compare') {
        const eventA = findEventByName(interaction.options.getString('event_a'));
        const eventB = findEventByName(interaction.options.getString('event_b'));
        const entryA = eventA && getCollection(userId)[eventA.id];
        const entryB = eventB && getCollection(userId)[eventB.id];
        if (!entryA || !entryB) { await interaction.reply({ content: "You don't own one (or both) of those.", ephemeral: true }); return; }
        await interaction.reply(
          `**${eventA.name}**: Lv.${entryA.level}, Power ${entryA.power}\n**${eventB.name}**: Lv.${entryB.level}, Power ${entryB.power}\n` +
          `${entryA.power === entryB.power ? "It's a tie!" : `**${entryA.power > entryB.power ? eventA.name : eventB.name}** is stronger.`}`
        );
        return;
      }
      if (sub === 'duplicate') {
        const collection = getCollection(userId);
        const dupes = Object.entries(collection).filter(([, e]) => e.count > 1).map(([id, e]) => `${findEventById(id)?.name || id} x${e.count}`);
        await interaction.reply(dupes.length ? `**Duplicates:**\n${dupes.join('\n')}` : 'No duplicates yet.');
        return;
      }
    }

    // ============================================================
    // /historybux ...
    // ============================================================
    if (name === 'historybux') {
      const userId = interaction.user.id;

      if (!group && sub === 'balance') {
        await interaction.reply(`💳 You have **${getBux(userId)} bux**.`);
        return;
      }
      if (!group && sub === 'daily') {
        const last = data.lastDaily[userId] || 0;
        if (Date.now() - last < 24 * 60 * 60 * 1000) {
          const hrs = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
          await interaction.reply({ content: `⏳ Already claimed. Try again in ~${hrs}h.`, ephemeral: true });
          return;
        }
        data.lastDaily[userId] = Date.now();
        addBux(userId, DAILY_AMOUNT);
        saveData(data);
        await interaction.reply(`💰 Claimed your daily **${DAILY_AMOUNT} bux**! Balance: ${getBux(userId)}.`);
        return;
      }
      if (!group && sub === 'give') {
        const target = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (getBux(userId) < amount) { await interaction.reply({ content: 'Not enough bux.', ephemeral: true }); return; }
        addBux(userId, -amount);
        addBux(target.id, amount);
        saveData(data);
        await interaction.reply(`💸 Gave **${amount} bux** to ${target}.`);
        return;
      }
      if (!group && sub === 'sell') {
        const event = findEventByName(interaction.options.getString('event'));
        const entry = event && getCollection(userId)[event.id];
        if (!entry) { await interaction.reply({ content: "You don't own that event.", ephemeral: true }); return; }
        const value = (rarityIndex(event.rarity) + 1) * 10;
        entry.count -= 1;
        if (entry.count <= 0) delete data.collections[userId][event.id];
        addBux(userId, value);
        saveData(data);
        await interaction.reply(`💵 Sold **${event.name}** for **${value} bux**.`);
        return;
      }

      if (group === 'shop') {
        if (sub === 'view') {
          const lines = [
            `**catchphrase** — ${SHOP_PRICES.catchphrase} bux — custom line added to your catch messages`,
            `**guarantee** — ${SHOP_PRICES.guaranteeBase}+ bux — guarantee your next catch is at least a chosen rarity`,
            `**rarespawn** — ${SHOP_PRICES.rarespawn} bux — next server spawn is Gold rarity or better`,
            `**rarityboost** — ${SHOP_PRICES.rarityboost} bux — 15% chance to upgrade a catch's rarity for 2 hours`,
            `**reroll** — ${SHOP_PRICES.reroll} bux — reroll an owned event's stat bonuses`,
            `**spawnboost** — ${SHOP_PRICES.spawnboost} bux — halves the spawn interval for 2 hours`,
            `**specialboost** — ${SHOP_PRICES.specialboost} bux — boosts rare special event odds for 2 hours`,
          ];
          await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛒 Historybux Shop').setDescription(lines.join('\n')).setColor(0x1abc9c)] });
          return;
        }
        if (sub === 'catchphrase') {
          const phrase = interaction.options.getString('phrase').slice(0, 100);
          if (getBux(userId) < SHOP_PRICES.catchphrase) { await interaction.reply({ content: `Need ${SHOP_PRICES.catchphrase} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.catchphrase);
          data.catchphrases[userId] = phrase;
          saveData(data);
          await interaction.reply(`✅ Catch phrase set: "${phrase}"`);
          return;
        }
        if (sub === 'guarantee') {
          const rarity = interaction.options.getString('rarity');
          const cost = SHOP_PRICES.guaranteeBase * (rarityIndex(rarity) + 1);
          if (getBux(userId) < cost) { await interaction.reply({ content: `Need ${cost} bux for a ${rarity} guarantee.`, ephemeral: true }); return; }
          addBux(userId, -cost);
          data.guaranteeRarity[userId] = rarity;
          saveData(data);
          await interaction.reply(`✅ Your next catch is guaranteed at least **${rarity}** quality.`);
          return;
        }
        if (sub === 'rarespawn') {
          if (getBux(userId) < SHOP_PRICES.rarespawn) { await interaction.reply({ content: `Need ${SHOP_PRICES.rarespawn} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.rarespawn);
          data.config.forceNextRareSpawn = true;
          saveData(data);
          await interaction.reply('✅ The next spawn in this server will be Gold rarity or better!');
          return;
        }
        if (sub === 'rarityboost') {
          if (getBux(userId) < SHOP_PRICES.rarityboost) { await interaction.reply({ content: `Need ${SHOP_PRICES.rarityboost} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.rarityboost);
          data.rarityBoostUntil[userId] = Date.now() + BOOST_DURATION_MS;
          saveData(data);
          await interaction.reply('✅ Rarity boost active for 2 hours!');
          return;
        }
        if (sub === 'reroll') {
          const event = findEventByName(interaction.options.getString('event'));
          const entry = event && getCollection(userId)[event.id];
          if (!entry) { await interaction.reply({ content: "You don't own that event.", ephemeral: true }); return; }
          if (getBux(userId) < SHOP_PRICES.reroll) { await interaction.reply({ content: `Need ${SHOP_PRICES.reroll} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.reroll);
          entry.var1 = rollVariance();
          entry.var2 = rollVariance();
          recomputePower(entry, getRarity(event.rarity));
          saveData(data);
          await interaction.reply(`🎲 Rerolled **${event.name}**! New stats: ${entry.var1 >= 0 ? '+' : ''}${entry.var1}% / ${entry.var2 >= 0 ? '+' : ''}${entry.var2}%. New power: ${entry.power}.`);
          return;
        }
        if (sub === 'spawnboost') {
          if (getBux(userId) < SHOP_PRICES.spawnboost) { await interaction.reply({ content: `Need ${SHOP_PRICES.spawnboost} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.spawnboost);
          data.config.spawnBoostUntil = Date.now() + BOOST_DURATION_MS;
          saveData(data);
          await interaction.reply('✅ Spawn interval halved server-wide for 2 hours!');
          return;
        }
        if (sub === 'specialboost') {
          if (getBux(userId) < SHOP_PRICES.specialboost) { await interaction.reply({ content: `Need ${SHOP_PRICES.specialboost} bux.`, ephemeral: true }); return; }
          addBux(userId, -SHOP_PRICES.specialboost);
          data.config.specialBoostUntil = Date.now() + BOOST_DURATION_MS;
          saveData(data);
          await interaction.reply('✅ Special event odds boosted for 2 hours!');
          return;
        }
      }
    }

    // ============================================================
    // /historyadmin ...
    // ============================================================
    if (name === 'historyadmin') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'Only server admins can use this.', ephemeral: true });
        return;
      }
      if (sub === 'setspawnchannel') {
        const channel = interaction.options.getChannel('channel');
        data.config.spawnChannelId = channel.id;
        saveData(data);
        await interaction.reply(`✅ Historyballs will now spawn in ${channel}, every 30 minutes.`);
        return;
      }
      if (sub === 'forcespawn') {
        if (!data.config.spawnChannelId) { await interaction.reply({ content: 'Set a spawn channel first.', ephemeral: true }); return; }
        await spawnEvent(interaction.guild);
        await interaction.reply({ content: '✅ Spawned.', ephemeral: true });
        return;
      }
      if (sub === 'spawn') {
        if (!data.config.spawnChannelId) { await interaction.reply({ content: 'Set a spawn channel first.', ephemeral: true }); return; }
        const eventId = interaction.options.getString('event');
        const count = interaction.options.getInteger('count') || 1;
        const forcedEvent = eventId ? findEventById(eventId) : null;
        if (eventId && !forcedEvent) { await interaction.reply({ content: 'Could not find that event.', ephemeral: true }); return; }

        await interaction.reply({ content: `⏳ Spawning ${count}x ${forcedEvent ? forcedEvent.name : 'random event(s)'}...`, ephemeral: true });
        for (let i = 0; i < count; i++) {
          await spawnEvent(interaction.guild, forcedEvent);
          if (i < count - 1) await new Promise((r) => setTimeout(r, 350)); // avoid rate limits
        }
        await interaction.followUp({ content: `✅ Spawned ${count}.`, ephemeral: true });
        return;
      }
      if (sub === 'createevent') {
        const eventName = interaction.options.getString('name');
        const era = interaction.options.getString('era');
        const aliases = interaction.options.getString('aliases').split(',').map((s) => s.trim().toLowerCase());
        const rarity = interaction.options.getString('rarity');
        const flagA = interaction.options.getString('flag_a');
        const flagB = interaction.options.getString('flag_b');
        const id = `custom-${eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        data.customEvents[id] = {
          id, name: eventName, era, rarity,
          flagA: flagA && FLAGS[flagA] ? flagA : null,
          flagB: flagB && FLAGS[flagB] ? flagB : null,
          aliases: [eventName.toLowerCase(), ...aliases],
          special: true,
        };
        saveData(data);
        await interaction.reply({ content: `✅ Created special event **${eventName}** (${rarity}). It will spawn rarely, mixed in with normal spawns. Use \`/historyadmin runevent\` to force it in now.`, ephemeral: true });
        return;
      }
      if (sub === 'listevents') {
        const list = Object.values(data.customEvents);
        if (list.length === 0) { await interaction.reply({ content: 'No custom events yet.', ephemeral: true }); return; }
        const lines = list.map((e) => `**${e.name}** (${e.rarity}) — ${e.era}`);
        const flagKeys = Object.keys(FLAGS).join(', ');
        await interaction.reply({ content: `**Custom Events:**\n${lines.join('\n')}\n\nAvailable flag keys: ${flagKeys}`, ephemeral: true });
        return;
      }
      if (sub === 'runevent') {
        const eventName = interaction.options.getString('name');
        const event = Object.values(data.customEvents).find((e) => e.name.toLowerCase() === eventName.toLowerCase());
        if (!event) { await interaction.reply({ content: 'No custom event with that name.', ephemeral: true }); return; }
        if (!data.config.spawnChannelId) { await interaction.reply({ content: 'Set a spawn channel first.', ephemeral: true }); return; }
        await spawnEvent(interaction.guild, event);
        await interaction.reply({ content: `✅ Ran **${event.name}**.`, ephemeral: true });
        return;
      }
      if (sub === 'deleteevent') {
        const eventName = interaction.options.getString('name');
        const entry = Object.entries(data.customEvents).find(([, e]) => e.name.toLowerCase() === eventName.toLowerCase());
        if (!entry) { await interaction.reply({ content: 'No custom event with that name.', ephemeral: true }); return; }
        delete data.customEvents[entry[0]];
        saveData(data);
        await interaction.reply({ content: `🗑️ Deleted **${eventName}**.`, ephemeral: true });
        return;
      }
      if (sub === 'status') {
        const channel = data.config.spawnChannelId ? `<#${data.config.spawnChannelId}>` : 'not set';
        const spawning = data.config.disabled ? '❌ Disabled' : '✅ Enabled';
        const activeCount = Object.keys(data.activeSpawns).length;
        const customCount = Object.keys(data.customEvents).length;
        await interaction.reply({
          content: `**Server Config**\nSpawn channel: ${channel}\nSpawning: ${spawning}\nActive live spawns: ${activeCount}\nCustom events stored: ${customCount}`,
          ephemeral: true,
        });
        return;
      }
      if (sub === 'disable') {
        data.config.disabled = interaction.options.getBoolean('disabled');
        saveData(data);
        await interaction.reply({ content: `✅ Automatic spawning is now ${data.config.disabled ? 'disabled' : 'enabled'}.`, ephemeral: true });
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
