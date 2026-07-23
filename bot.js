require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
  SlashCommandBuilder, REST, Routes,
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const GUILD_ID = '1324059331406069872';
const MOD_OF_THE_DAY_CHANNEL_ID = '1528326035605819402';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const AUTO_TRAINING_CHANNEL_ID = '1528327903371202653';
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_INACTIVITY_WARNS = 3;
const MOD_OF_DAY_BONUS = 50;
const AUTO_TRAIN_ANSWER_WINDOW_MS = 60 * 1000;
const AUTO_TRAIN_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const AUTO_TRAIN_MAX_GAP_MS = 30 * 60 * 60 * 1000;
const CLAIM_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CLAIM_AMOUNT = 20;
const START_TIME = Date.now();

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      credits: {}, warns: {}, tags: {}, ranks: {},
      lastActive: {}, inactivityWarns: {}, config: {},
      dailyCredits: {}, pfps: {}, onBreak: {}, trainingStats: {},
      lastClaim: {}, ownedItems: {}, creditBoost: {}, profileColor: {},
      breakPassExpires: {},
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {};
  parsed.inactivityWarns ??= {};
  parsed.config ??= {};
  parsed.dailyCredits ??= {};
  parsed.pfps ??= {};
  parsed.onBreak ??= {};
  parsed.trainingStats ??= {};
  parsed.lastClaim ??= {};
  parsed.ownedItems ??= {};
  parsed.creditBoost ??= {};
  parsed.profileColor ??= {};
  parsed.breakPassExpires ??= {};
  return parsed;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let data = loadData();

function getLogChannel(guild) {
  const id = data.config.logChannelId || DEFAULT_LOG_CHANNEL_ID;
  return guild.channels.cache.get(id);
}
function buildLogEmbed(emoji, title, description, actor, color = 0x5865f2) {
  return new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setDescription(description)
    .addFields(
      { name: 'From', value: `${actor.tag} (${actor.id})`, inline: false },
      { name: 'Time', value: new Date().toLocaleString('en-US'), inline: false },
    )
    .setColor(color);
}
function sendLog(guild, emoji, title, description, actor, color) {
  getLogChannel(guild)?.send({ embeds: [buildLogEmbed(emoji, title, description, actor, color)] });
}

// ---------- Credit rewards ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };

function addCredits(userId, amount) {
  let finalAmount = amount;
  if (amount > 0 && data.creditBoost?.[userId]) {
    finalAmount = amount * 2;
    delete data.creditBoost[userId];
  }
  data.credits[userId] = Math.max(0, (data.credits[userId] || 0) + finalAmount);
  data.dailyCredits[userId] = (data.dailyCredits[userId] || 0) + finalAmount;
  updateTag(userId);
  saveData(data);
  return finalAmount;
}
function markActive(userId) {
  data.lastActive[userId] = Date.now();
  if (data.inactivityWarns[userId]) data.inactivityWarns[userId] = 0;
  saveData(data);
}

// ---------- Auto tag system ----------
const TAG_TIERS = [
  { max: -150, tag: 'Terrible' },
  { max: -1, tag: 'Bad' },
  { max: 299, tag: 'Good' },
  { max: 699, tag: 'Great' },
  { max: Infinity, tag: 'Excellent' },
];
function computeAutoTag(userId) {
  const credits = data.credits[userId] || 0;
  const warnCount = (data.warns[userId] || []).length;
  const inactivityWarnCount = data.inactivityWarns[userId] || 0;
  if (inactivityWarnCount > 0 && inactivityWarnCount >= MAX_INACTIVITY_WARNS - 1) return 'Verge of Demotion';
  const score = credits - warnCount * 40;
  for (const tier of TAG_TIERS) if (score <= tier.max) return tier.tag;
  return 'Good';
}
function updateTag(userId) {
  if (data.tags[userId]?.manual) return;
  data.tags[userId] = { text: computeAutoTag(userId), manual: false };
}
const TAG_COLORS = {
  Excellent: 0x2ecc71, Great: 0x3498db, Good: 0x95a5a6,
  Bad: 0xe67e22, Terrible: 0xe74c3c, 'Verge of Demotion': 0xc0392b,
};
function colorForTag(tagText) {
  return TAG_COLORS[tagText] || 0x5865f2;
}

// ---------- Rank ladder ----------
const RANK_LADDER = [
  { name: 'Trial Moderator', cost: 0 },
  { name: 'Moderator', cost: 50 },
  { name: 'Senior Moderator', cost: 150 },
  { name: 'Head Moderator', cost: 300 },
  { name: 'Trial Admin', cost: 500 },
  { name: 'Admin', cost: 750 },
  { name: 'Senior Admin', cost: 1050 },
  { name: 'Head Admin', cost: 1400 },
  { name: 'Assistant Server Manager', cost: 1700 },
  { name: 'Server Manager', cost: 2000 },
];
function getRankIndex(userId) {
  return data.ranks[userId] ?? -1;
}
function findRoleByName(guild, name) {
  return guild.roles.cache.find((r) => r.name === name) || null;
}

// ---------- Shop ----------
const SHOP_ITEMS = [
  { id: 'tag-veteran', name: 'Veteran Tag', cost: 60, type: 'tag', tagText: '🎖️ Veteran Moderator' },
  { id: 'warn-clear', name: 'Warning Removal Token', cost: 120, type: 'removeWarn',
    desc: 'Removes your oldest warn from your record.' },
  { id: 'break-pass', name: '48h Break Pass', cost: 100, type: 'breakPass',
    desc: 'Skips inactivity checks for 48 hours — no need to use /break.' },
  { id: 'credit-boost', name: 'Double Credits Token', cost: 150, type: 'creditBoost',
    desc: 'Your next mod action or training answer pays double credits.' },
  { id: 'profile-gold', name: 'Gold Profile Color', cost: 200, type: 'profileColor', color: 0xffd700,
    desc: 'Gives your /profile card a gold accent color.' },
  { id: 'profile-crimson', name: 'Crimson Profile Color', cost: 200, type: 'profileColor', color: 0xdc143c,
    desc: 'Gives your /profile card a crimson accent color.' },
  { id: 'tag-elite', name: 'Elite Tag', cost: 350, type: 'tag', tagText: '👑 Elite Team Member' },
];

// ---------- One-time seed ----------
const SEED_MODERATORS = [
  { userId: '1446192510593662976', rankName: 'Senior Moderator', credits: 250 },
  { userId: '1320483185636802592', rankName: 'Moderator', credits: 0 },
  { userId: '1222684836091658330', rankName: 'Server Manager', credits: 0 },
  { userId: '1198527966972477505', rankName: 'Server Manager', credits: 0 },
  { userId: '1528326521721196544', rankName: 'Moderator', credits: 0 },
];
async function seedInitialModerators(guild) {
  if (data.config.seeded) return;
  for (const entry of SEED_MODERATORS) {
    const rankIndex = RANK_LADDER.findIndex((r) => r.name === entry.rankName);
    if (rankIndex === -1) continue;
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    const role = findRoleByName(guild, entry.rankName);
    if (member && role) await member.roles.add(role).catch(() => {});
    data.ranks[entry.userId] = rankIndex;
    data.credits[entry.userId] = entry.credits;
    data.lastActive[entry.userId] = Date.now();
    updateTag(entry.userId);
  }
  data.config.seeded = true;
  saveData(data);
  console.log('Seeded initial moderator roster.');
}

// ---------- Permission requirements (minimum rank index); undefined = no requirement ----------
const RANK_REQUIREMENTS = {
  mute: 0, unmute: 0, warn: 0, minorwarn: 0,
  kick: 1, majorwarn: 1, purge: 1,
  ban: 2, clearwarns: 2,
  unban: 5, addcredits: 5, removecredits: 5, demote: 5, rankmod: 5,
  embed: 3,
  setrank: 7,
};
function hasRequiredRank(userId, commandName) {
  const required = RANK_REQUIREMENTS[commandName];
  if (required === undefined) return true;
  return getRankIndex(userId) >= required;
}
// Returns true if allowed; replies with an ephemeral error and returns false otherwise.
async function checkRankGate(interaction, commandName) {
  if (RANK_REQUIREMENTS[commandName] === undefined) return true;
  const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;
  if (!hasRequiredRank(interaction.user.id, commandName)) {
    const requiredRankName = RANK_LADDER[RANK_REQUIREMENTS[commandName]].name;
    await interaction.reply({ content: `🚫 You need to be at least **${requiredRankName}** to use this command.`, ephemeral: true });
    return false;
  }
  return true;
}

// ---------- Warn / mute durations ----------
const WARN_DURATIONS = { warn: 2, minorwarn: 1, majorwarn: 3 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MUTE_DURATIONS = {
  '1m': 60 * 1000, '5m': 5 * 60 * 1000, '10m': 10 * 60 * 1000, '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000, '3h': 3 * 60 * 60 * 1000, '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000, '24h': 24 * 60 * 60 * 1000,
};
const DEFAULT_MUTE_MS = MUTE_DURATIONS['10m'];

async function applyWarn(interaction, type, target) {
  const weeks = WARN_DURATIONS[type];
  const ms = weeks * WEEK_MS;
  try {
    await target.timeout(ms, `${type} issued by ${interaction.user.tag}`);
  } catch {
    await interaction.reply({ content: 'Failed to timeout that member (check role hierarchy/permissions).', ephemeral: true });
    return;
  }
  data.warns[target.id] = data.warns[target.id] || [];
  data.warns[target.id].push({ type, by: interaction.user.id, at: Date.now(), expiresAt: Date.now() + ms });
  updateTag(target.id);
  saveData(data);

  const label = type === 'warn' ? 'Warn' : type === 'minorwarn' ? 'Minor Warn' : 'Major Warn';
  await interaction.reply(`${target} has been given a **${type}** — timed out for ${weeks} week(s).`);
  sendLog(interaction.guild, '⚠️', `New ${label}`, `${target.user.tag} was warned — timed out for ${weeks} week(s).`, interaction.user, 0xe67e22);
}

async function demoteMember(guild, member) {
  const currentIndex = getRankIndex(member.id);
  if (currentIndex <= 0) return null;
  const currentRank = RANK_LADDER[currentIndex];
  const lowerRank = RANK_LADDER[currentIndex - 1];
  const currentRole = findRoleByName(guild, currentRank.name);
  const lowerRole = findRoleByName(guild, lowerRank.name);
  try {
    if (currentRole) await member.roles.remove(currentRole).catch(() => {});
    if (lowerRole) await member.roles.add(lowerRole).catch(() => {});
  } catch {
    return null;
  }
  data.ranks[member.id] = currentIndex - 1;
  updateTag(member.id);
  saveData(data);
  return lowerRank.name;
}

// ---------- Quiz ----------
const quiz = [
  { q: '1) What happens if someone sends NSFW content?', a: '1 day timeout', rule: 'Rule 1: No NSFW — 1 day timeout.' },
  { q: '2) What happens if someone spams?', a: '60 second timeout', rule: 'Rule 2: No spamming — 60 second timeout.' },
  { q: '3) What happens if someone posts illegal/extremist politics?', a: '1 day timeout', rule: 'Rule 3: No illegal politics — 1 day timeout.' },
  { q: '4) Who is allowed to swear?', a: 'the designated role', rule: 'Rule 4: No swearing unless you have the designated role.' },
  { q: '5) What happens if someone is racist?', a: '5 minute timeout', rule: 'Rule 5: No racism — 5 minute timeout.' },
  { q: '6) What happens for bullying or discrimination?', a: '1 hour timeout', rule: 'Rule 6: No bullying/discrimination — 1 hour timeout.' },
  { q: '7) What happens if someone raids the server?', a: 'permanent ban', rule: 'Rule 7: No raiding — permanent ban.' },
  { q: '8) What is rule 8, in short?', a: 'be friendly', rule: 'Rule 8: Be friendly.' },
  { q: '9) What are you not allowed to share or ask for?', a: 'private information', rule: "Rule 9: Don't share or ask for private information." },
  { q: '10) What happens for posting gore?', a: '60 second timeout', rule: 'Rule 11: No gore — 60 second timeout.' },
  { q: '11) What happens if someone is "freaky or weird"?', a: '5 minute timeout', rule: 'Rule 12: No being freaky/weird — 5 minute timeout.' },
  { q: '12) What happens if someone impersonates another user?', a: 'kicked', rule: 'Rule 13: No impersonating anybody — kicked from the server.' },
  { q: '13) What happens if someone leaks private info of another user?', a: 'permanent ban or 1 week timeout', rule: 'Rule 14: No leaking private info — permanent ban or 1 week timeout.' },
  { q: '14) What happens if someone tries to manipulate the owner to bypass rules?', a: 'permanent ban, no exceptions', rule: 'Rule 15: No manipulating the owner to bypass rules — permanent ban, no exceptions.' },
  { q: "15) Why can't you ping @everyone or @here in public chats?", a: 'it might wake people up who are sleeping', rule: 'Rule 16: No pinging @everyone/@here in public chats.' },
];
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
const activeSessions = new Set();
function recordTrainingResult(userId, correct) {
  const stats = data.trainingStats[userId] || { taken: 0, correct: 0 };
  stats.taken += 1;
  if (correct) stats.correct += 1;
  data.trainingStats[userId] = stats;
  saveData(data);
}

// ---------- Inactivity check ----------
async function checkInactivity(guild) {
  const now = Date.now();
  for (const userId of Object.keys(data.ranks)) {
    if (data.onBreak[userId]) {
      const passExpiry = data.breakPassExpires?.[userId];
      if (passExpiry && Date.now() >= passExpiry) {
        delete data.onBreak[userId];
        delete data.breakPassExpires[userId];
        data.lastActive[userId] = Date.now();
        saveData(data);
      } else {
        continue;
      }
    }
    const rankIndex = getRankIndex(userId);
    if (rankIndex <= 0) continue;
    const last = data.lastActive[userId] || 0;
    if (now - last < INACTIVITY_THRESHOLD_MS) continue;

    data.inactivityWarns[userId] = (data.inactivityWarns[userId] || 0) + 1;
    const warnCount = data.inactivityWarns[userId];
    updateTag(userId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    if (warnCount >= MAX_INACTIVITY_WARNS) {
      const newRank = await demoteMember(guild, member);
      data.inactivityWarns[userId] = 0;
      data.lastActive[userId] = now;
      updateTag(userId);
      saveData(data);
      const msg = newRank
        ? `⬇️ ${member} was demoted to **${newRank}** for inactivity.`
        : `${member} hit max inactivity warnings but is already at the lowest rank.`;
      getLogChannel(guild)?.send(msg);
      member.send(msg).catch(() => {});
    } else {
      saveData(data);
      const msg = `⚠️ ${member}, inactivity warning **${warnCount}/${MAX_INACTIVITY_WARNS}** — any command resets this. On break? Use /break.`;
      getLogChannel(guild)?.send(msg);
      member.send(msg).catch(() => {});
    }
  }
}

async function pickModeratorOfTheDay(guild) {
  const channel = guild.channels.cache.get(MOD_OF_THE_DAY_CHANNEL_ID);
  if (!channel) return;
  const entries = Object.entries(data.dailyCredits).filter(([, amt]) => amt > 0);
  if (entries.length === 0) { data.dailyCredits = {}; saveData(data); return; }
  entries.sort((a, b) => b[1] - a[1]);
  const [winnerId, winnerCredits] = entries[0];
  const member = await guild.members.fetch(winnerId).catch(() => null);
  if (member) {
    addCredits(winnerId, MOD_OF_DAY_BONUS);
    const tag = data.tags[winnerId]?.text || computeAutoTag(winnerId);
    const embed = new EmbedBuilder()
      .setTitle('🏆 Moderator of the Day')
      .setDescription(`${member} earned **${winnerCredits} credits** today — the most of any moderator! 🎉`)
      .addFields({ name: 'Current Standing', value: tag, inline: true })
      .setColor(0xffd700).setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: 'Keep up the great work!' }).setTimestamp();
    channel.send({ embeds: [embed] });
  }
  data.dailyCredits = {};
  saveData(data);
}

async function runAutoTraining(guild) {
  const channel = guild.channels.cache.get(AUTO_TRAINING_CHANNEL_ID);
  if (!channel) return;
  const item = quiz[Math.floor(Math.random() * quiz.length)];
  const embed = new EmbedBuilder()
    .setTitle('📚 Surprise Training Question')
    .setDescription(`${item.q}\n\nFirst correct answer wins credits. You have 60 seconds.`)
    .setColor(0x3498db)
    .setFooter({ text: 'No pressure — just type your answer in this channel.' });
  await channel.send({ embeds: [embed] });

  try {
    const collected = await channel.awaitMessages({
      filter: (m) => !m.author.bot && data.ranks[m.author.id] !== undefined,
      max: 1, time: AUTO_TRAIN_ANSWER_WINDOW_MS, errors: ['time'],
    });
    const responder = collected.first();
    const answer = responder.content.toLowerCase();
    const correctKeywords = item.a.toLowerCase().split(' ');
    const isClose = correctKeywords.some((w) => w.length > 3 && answer.includes(w));
    recordTrainingResult(responder.author.id, isClose);
    if (isClose) {
      addCredits(responder.author.id, CREDIT_REWARDS.correctAnswer);
      channel.send({ embeds: [new EmbedBuilder().setDescription(`✅ **${responder.author.tag}** got it right!\n${item.rule}\n+${CREDIT_REWARDS.correctAnswer} credits`).setColor(0x2ecc71)] });
    } else {
      channel.send({ embeds: [new EmbedBuilder().setDescription(`❌ Not quite.\n${item.rule}`).setColor(0xe74c3c)] });
    }
  } catch {
    channel.send({ embeds: [new EmbedBuilder().setDescription(`⏱️ No one answered in time.\n${item.rule}`).setColor(0x95a5a6)] });
  }
}
function scheduleNextAutoTraining(guild) {
  const gap = AUTO_TRAIN_MIN_GAP_MS + Math.random() * (AUTO_TRAIN_MAX_GAP_MS - AUTO_TRAIN_MIN_GAP_MS);
  setTimeout(async () => {
    await runAutoTraining(guild);
    scheduleNextAutoTraining(guild);
  }, gap);
}

// ============================================================
// SLASH COMMAND DEFINITIONS
// ============================================================
const rankChoices = RANK_LADDER.map((r) => ({ name: r.name, value: r.name }));
const muteDurationChoices = Object.keys(MUTE_DURATIONS).map((k) => ({ name: k, value: k }));
const shopChoices = SHOP_ITEMS.map((i) => ({ name: `${i.name} (${i.cost} credits)`, value: i.id }));

const slashCommands = [
  // ECONOMY
  new SlashCommandBuilder().setName('claim').setDescription('Claim your daily credits.'),
  new SlashCommandBuilder().setName('addcredits').setDescription('Add credits to a moderator.')
    .addUserOption((o) => o.setName('user').setDescription('Who to give credits to').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many credits').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from a moderator.')
    .addUserOption((o) => o.setName('user').setDescription('Who to remove credits from').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('How many credits').setRequired(true).setMinValue(1)),
  new SlashCommandBuilder().setName('balance').setDescription('Check a credit balance.')
    .addUserOption((o) => o.setName('user').setDescription('Whose balance to check').setRequired(false)),
  new SlashCommandBuilder().setName('richlist').setDescription('Top 10 credit holders.'),

  // SHOP & PROFILE
  new SlashCommandBuilder().setName('shop').setDescription('View purchasable perks.'),
  new SlashCommandBuilder().setName('buy').setDescription('Purchase a perk from the shop.')
    .addStringOption((o) => o.setName('item').setDescription('Which item to buy').setRequired(true).addChoices(...shopChoices)),
  new SlashCommandBuilder().setName('profile').setDescription('View a moderator profile card.')
    .addUserOption((o) => o.setName('user').setDescription('Whose profile to view').setRequired(false)),
  new SlashCommandBuilder().setName('roster').setDescription('View the full moderator team by rank.'),
  new SlashCommandBuilder().setName('settag').setDescription('Set a manual profile tag.')
    .addStringOption((o) => o.setName('text').setDescription('The tag text').setRequired(true))
    .addUserOption((o) => o.setName('user').setDescription('Whose tag to set (Head Moderator+ only for others)').setRequired(false)),
  new SlashCommandBuilder().setName('setpfp').setDescription('Set the image shown on your profile card.')
    .addStringOption((o) => o.setName('url').setDescription('Direct image/gif URL').setRequired(true)),

  // RANKS
  new SlashCommandBuilder().setName('rankup').setDescription('Spend credits to promote yourself one rank.'),
  new SlashCommandBuilder().setName('rankmod').setDescription('Assign one or more people to a rank. Admin+, only below your own rank.')
    .addStringOption((o) => o.setName('rank').setDescription('Rank to assign').setRequired(true).addChoices(...rankChoices))
    .addUserOption((o) => o.setName('user1').setDescription('First person').setRequired(true))
    .addUserOption((o) => o.setName('user2').setDescription('Second person').setRequired(false))
    .addUserOption((o) => o.setName('user3').setDescription('Third person').setRequired(false))
    .addUserOption((o) => o.setName('user4').setDescription('Fourth person').setRequired(false))
    .addUserOption((o) => o.setName('user5').setDescription('Fifth person').setRequired(false)),
  new SlashCommandBuilder().setName('setrank').setDescription('Directly set a moderator\'s rank. Head Admin+, no hierarchy restriction.')
    .addUserOption((o) => o.setName('user').setDescription('Who to update').setRequired(true))
    .addStringOption((o) => o.setName('rank').setDescription('Rank to set').setRequired(true).addChoices(...rankChoices)),
  new SlashCommandBuilder().setName('demote').setDescription('Demote a moderator one rank down. Admin+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to demote').setRequired(true)),
  new SlashCommandBuilder().setName('mystats').setDescription('View your training accuracy.'),
  new SlashCommandBuilder().setName('progress').setDescription('View training question accuracy.')
    .addUserOption((o) => o.setName('user').setDescription('Whose progress to view').setRequired(false)),

  // MODERATION
  new SlashCommandBuilder().setName('warn').setDescription('Issue a standard warn (2 week timeout). Trial Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to warn').setRequired(true)),
  new SlashCommandBuilder().setName('minorwarn').setDescription('Issue a minor warn (1 week timeout). Trial Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to warn').setRequired(true)),
  new SlashCommandBuilder().setName('majorwarn').setDescription('Issue a major warn (3 week timeout). Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to warn').setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('List a user\'s warn history.')
    .addUserOption((o) => o.setName('user').setDescription('Whose warns to view').setRequired(false)),
  new SlashCommandBuilder().setName('clearwarns').setDescription('Wipe a user\'s warn history. Senior Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Whose warns to clear').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member. Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to kick').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member. Senior Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to ban').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID. Admin+.')
    .addStringOption((o) => o.setName('userid').setDescription('The user ID to unban').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a member. Trial Moderator+.')
    .addUserOption((o) => o.setName('user').setDescription('Who to mute').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('How long (default 10m)').setRequired(false).addChoices(...muteDurationChoices)),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove an active timeout.')
    .addUserOption((o) => o.setName('user').setDescription('Who to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('purge').setDescription('Bulk delete recent messages. Moderator+.')
    .addIntegerOption((o) => o.setName('amount').setDescription('How many messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  // EXTRAS
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency.'),
  new SlashCommandBuilder().setName('uptime').setDescription('Show how long the bot has been online.'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show server stats.'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show account/join info for a user.')
    .addUserOption((o) => o.setName('user').setDescription('Whose info to view').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Show a user\'s avatar.')
    .addUserOption((o) => o.setName('user').setDescription('Whose avatar to view').setRequired(false)),
  new SlashCommandBuilder().setName('embed').setDescription('Post a styled embed message. Admin+.')
    .addStringOption((o) => o.setName('text').setDescription('The message content').setRequired(true)),
  new SlashCommandBuilder().setName('feedback').setDescription('Send feedback to the log channel.')
    .addStringOption((o) => o.setName('message').setDescription('Your feedback').setRequired(true)),

  // TRAINING
  new SlashCommandBuilder().setName('training').setDescription('Start a full rulebook training quiz.'),
  new SlashCommandBuilder().setName('trainingexamples').setDescription('See sample training questions.'),
  new SlashCommandBuilder().setName('trainingrules').setDescription('View the full rulebook.'),

  // MISC / ADMIN
  new SlashCommandBuilder().setName('setup').setDescription('Set the logging channel. Admin only.')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for logs').setRequired(true)),
  new SlashCommandBuilder().setName('break').setDescription('Pause inactivity tracking while you\'re away.'),
  new SlashCommandBuilder().setName('unbreak').setDescription('End your break and resume inactivity tracking.'),
  new SlashCommandBuilder().setName('modoftheday').setDescription('Manually trigger Moderator of the Day. Admin only.'),
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: slashCommands },
  );
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
  if (guild) {
    seedInitialModerators(guild);
    setInterval(() => checkInactivity(guild), CHECK_INTERVAL_MS);
    setInterval(() => pickModeratorOfTheDay(guild), CHECK_INTERVAL_MS);
    scheduleNextAutoTraining(guild);
  }
});

// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guild) return;
  const name = interaction.commandName;

  if (RANK_REQUIREMENTS[name] !== undefined) {
    const allowed = await checkRankGate(interaction, name);
    if (!allowed) return;
  }
  markActive(interaction.user.id);

  try {
    switch (name) {
      // ---------- help ----------
      case 'help': {
        const categories = {
          ECONOMY: ['claim', 'addcredits', 'removecredits', 'balance', 'richlist'],
          'SHOP & PROFILE': ['shop', 'buy', 'profile', 'roster', 'settag', 'setpfp'],
          RANKS: ['rankup', 'rankmod', 'setrank', 'demote', 'mystats', 'progress'],
          MODERATION: ['warn', 'minorwarn', 'majorwarn', 'warnings', 'clearwarns', 'kick', 'ban', 'unban', 'mute', 'unmute', 'purge'],
          EXTRAS: ['ping', 'uptime', 'serverinfo', 'userinfo', 'avatar', 'embed', 'feedback'],
          TRAINING: ['training', 'trainingexamples', 'trainingrules'],
        };
        let out = '```\n';
        for (const [cat, cmds] of Object.entries(categories)) {
          out += `${cat}:\n`;
          for (const c of cmds) out += `  /${c}\n`;
          out += '\n';
        }
        out += 'Type / in chat to see live usage for any command.\n```';
        await interaction.reply({ content: out, ephemeral: true });
        return;
      }

      // ---------- setup ----------
      case 'setup': {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: 'Only server admins can run setup.', ephemeral: true });
          return;
        }
        const channel = interaction.options.getChannel('channel');
        data.config.logChannelId = channel.id;
        saveData(data);
        await interaction.reply(`✅ Logging will now post in ${channel}.`);
        return;
      }

      // ---------- break / unbreak ----------
      case 'break': {
        if (getRankIndex(interaction.user.id) < 0) {
          await interaction.reply({ content: "You're not on the moderator team, so there's no inactivity tracking to pause.", ephemeral: true });
          return;
        }
        if (data.onBreak[interaction.user.id]) {
          await interaction.reply({ content: "You're already marked as on break.", ephemeral: true });
          return;
        }
        data.onBreak[interaction.user.id] = Date.now();
        saveData(data);
        await interaction.reply('🌴 You are now on break — inactivity warnings are fully paused. Use `/unbreak` when you\'re back.');
        sendLog(interaction.guild, '🌴', 'Break Started', `${interaction.user.tag} started a break.`, interaction.user, 0x1abc9c);
        return;
      }
      case 'unbreak': {
        if (!data.onBreak[interaction.user.id]) {
          await interaction.reply({ content: "You're not currently on break.", ephemeral: true });
          return;
        }
        delete data.onBreak[interaction.user.id];
        markActive(interaction.user.id);
        saveData(data);
        await interaction.reply('👋 Welcome back! Inactivity tracking has resumed.');
        sendLog(interaction.guild, '👋', 'Break Ended', `${interaction.user.tag} ended their break.`, interaction.user, 0x1abc9c);
        return;
      }

      // ---------- economy ----------
      case 'claim': {
        const last = data.lastClaim[interaction.user.id] || 0;
        const elapsed = Date.now() - last;
        if (elapsed < CLAIM_COOLDOWN_MS) {
          const hoursLeft = Math.ceil((CLAIM_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
          await interaction.reply({ content: `⏳ You've already claimed today. Try again in about ${hoursLeft} hour(s).`, ephemeral: true });
          return;
        }
        data.lastClaim[interaction.user.id] = Date.now();
        addCredits(interaction.user.id, CLAIM_AMOUNT);
        saveData(data);
        await interaction.reply(`💰 You claimed your daily **${CLAIM_AMOUNT} credits**! New balance: ${data.credits[interaction.user.id]}.`);
        return;
      }
      case 'balance': {
        const target = interaction.options.getMember('user') || interaction.member;
        await interaction.reply(`💳 ${target.id === interaction.member.id ? 'Your' : `${target.user.tag}'s`} balance: **${data.credits[target.id] || 0} credits**.`);
        return;
      }
      case 'richlist': {
        const sorted = Object.entries(data.credits).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (sorted.length === 0) {
          await interaction.reply('No one has earned credits yet.');
          return;
        }
        const lines = await Promise.all(sorted.map(async ([userId, amt], i) => {
          const member = await interaction.guild.members.fetch(userId).catch(() => null);
          return `**${i + 1}.** ${member ? member.user.tag : 'Unknown user'} — ${amt} credits`;
        }));
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💰 Richlist').setDescription(lines.join('\n')).setColor(0xf1c40f)] });
        return;
      }
      case 'addcredits':
      case 'removecredits': {
        const target = interaction.options.getMember('user');
        const amount = interaction.options.getInteger('amount');
        const delta = name === 'addcredits' ? amount : -amount;
        addCredits(target.id, delta);
        await interaction.reply(`${name === 'addcredits' ? '➕' : '➖'} ${target.user.tag}'s credits ${name === 'addcredits' ? 'increased' : 'decreased'} by ${amount}. New total: ${data.credits[target.id] || 0}.`);
        sendLog(interaction.guild, '💳', name === 'addcredits' ? 'Credits Added' : 'Credits Removed',
          `${amount} credits ${name === 'addcredits' ? 'added to' : 'removed from'} ${target.user.tag}. New total: ${data.credits[target.id] || 0}.`,
          interaction.user, name === 'addcredits' ? 0x2ecc71 : 0xe74c3c);
        return;
      }

      // ---------- shop ----------
      case 'shop': {
        const lines = SHOP_ITEMS.map((item) => `**${item.id}** — ${item.name} (${item.cost} credits)\n   ${item.desc || `Sets your tag to "${item.tagText}"`}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛒 Moderator Perk Shop').setDescription(lines.join('\n\n') + '\n\nBuy with `/buy`').setColor(0x1abc9c)] });
        return;
      }
      case 'buy': {
        const itemId = interaction.options.getString('item');
        const item = SHOP_ITEMS.find((i) => i.id === itemId);
        const credits = data.credits[interaction.user.id] || 0;
        if (credits < item.cost) {
          await interaction.reply({ content: `You need ${item.cost} credits for **${item.name}** (you have ${credits}).`, ephemeral: true });
          return;
        }
        data.credits[interaction.user.id] = credits - item.cost;
        data.ownedItems[interaction.user.id] = data.ownedItems[interaction.user.id] || [];
        if (!data.ownedItems[interaction.user.id].includes(item.id)) data.ownedItems[interaction.user.id].push(item.id);

        let resultMsg = `✅ You bought **${item.name}**!`;
        if (item.type === 'tag') {
          data.tags[interaction.user.id] = { text: item.tagText, manual: true };
          resultMsg += ` Your tag is now: ${item.tagText}`;
        } else if (item.type === 'removeWarn') {
          const warns = data.warns[interaction.user.id] || [];
          if (warns.length === 0) {
            resultMsg += ` You had no warns to remove.`;
          } else {
            warns.shift();
            data.warns[interaction.user.id] = warns;
            updateTag(interaction.user.id);
            resultMsg += ` Your oldest warn was removed.`;
          }
        } else if (item.type === 'breakPass') {
          data.onBreak[interaction.user.id] = Date.now();
          data.breakPassExpires = data.breakPassExpires || {};
          data.breakPassExpires[interaction.user.id] = Date.now() + 48 * 60 * 60 * 1000;
          resultMsg += ` You're exempt from inactivity checks for the next 48 hours.`;
        } else if (item.type === 'creditBoost') {
          data.creditBoost = data.creditBoost || {};
          data.creditBoost[interaction.user.id] = true;
          resultMsg += ` Your next mod action or training answer will pay double credits.`;
        } else if (item.type === 'profileColor') {
          data.profileColor = data.profileColor || {};
          data.profileColor[interaction.user.id] = item.color;
          resultMsg += ` Your profile card now uses this color.`;
        }
        saveData(data);
        await interaction.reply(resultMsg);
        return;
      }

      // ---------- warn commands ----------
      case 'warn': case 'minorwarn': case 'majorwarn': {
        const target = interaction.options.getMember('user');
        if (!target) { await interaction.reply({ content: 'Could not find that member.', ephemeral: true }); return; }
        await applyWarn(interaction, name, target);
        return;
      }
      case 'warnings': {
        const target = interaction.options.getMember('user') || interaction.member;
        const warns = data.warns[target.id] || [];
        if (warns.length === 0) { await interaction.reply(`${target} has no warns on record.`); return; }
        const lines = warns.map((w, i) => `**${i + 1}.** ${w.type} — issued <t:${Math.floor(w.at / 1000)}:R>`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${target.user.tag}'s Warnings`).setDescription(lines.join('\n')).setColor(0xe74c3c)] });
        return;
      }
      case 'clearwarns': {
        const target = interaction.options.getMember('user');
        data.warns[target.id] = [];
        updateTag(target.id);
        saveData(data);
        await interaction.reply(`✅ Cleared all warns for ${target}.`);
        sendLog(interaction.guild, '🧹', 'Warns Cleared', `All warns cleared for ${target.user.tag}.`, interaction.user, 0x2ecc71);
        return;
      }

      // ---------- mute/kick/ban/unmute/unban ----------
      case 'mute': {
        const target = interaction.options.getMember('user');
        const durationArg = interaction.options.getString('duration');
        const ms = MUTE_DURATIONS[durationArg] || DEFAULT_MUTE_MS;
        try {
          await target.timeout(ms, `Muted by ${interaction.user.tag}`);
        } catch {
          await interaction.reply({ content: 'Action failed — check bot permissions/role hierarchy.', ephemeral: true });
          return;
        }
        addCredits(interaction.user.id, CREDIT_REWARDS.mute);
        const label = durationArg && MUTE_DURATIONS[durationArg] ? durationArg : '10m (default)';
        await interaction.reply(`${target.user.tag} was muted for **${label}**. You earned ${CREDIT_REWARDS.mute} credits.`);
        sendLog(interaction.guild, '🔇', 'Member Muted', `${target.user.tag} (${target.id}) was muted for ${label}.`, interaction.user, 0xf39c12);
        return;
      }
      case 'kick': case 'ban': {
        const target = interaction.options.getMember('user');
        const targetTag = target.user.tag;
        const targetId = target.id;
        try {
          if (name === 'kick') await target.kick(`Kicked by ${interaction.user.tag}`);
          if (name === 'ban') await target.ban({ reason: `Banned by ${interaction.user.tag}` });
        } catch {
          await interaction.reply({ content: 'Action failed — check bot permissions/role hierarchy.', ephemeral: true });
          return;
        }
        addCredits(interaction.user.id, CREDIT_REWARDS[name]);
        await interaction.reply(`${targetTag} was ${name}ed. You earned ${CREDIT_REWARDS[name]} credits.`);
        sendLog(interaction.guild, name === 'kick' ? '👢' : '🔨', name === 'kick' ? 'Member Kicked' : 'Member Banned',
          `${targetTag} (${targetId}) was ${name}ed.`, interaction.user, name === 'kick' ? 0xe67e22 : 0xc0392b);
        return;
      }
      case 'unmute': {
        const target = interaction.options.getMember('user');
        try {
          await target.timeout(null, `Unmuted by ${interaction.user.tag}`);
          await interaction.reply(`${target} has been unmuted.`);
        } catch {
          await interaction.reply({ content: 'Failed to unmute — check bot permissions.', ephemeral: true });
        }
        return;
      }
      case 'unban': {
        const userId = interaction.options.getString('userid').replace(/[<@!>]/g, '');
        try {
          await interaction.guild.members.unban(userId, `Unbanned by ${interaction.user.tag}`);
          await interaction.reply(`✅ Unbanned user ID ${userId}.`);
          sendLog(interaction.guild, '🔓', 'Member Unbanned', `User ID ${userId} was unbanned.`, interaction.user, 0x2ecc71);
        } catch {
          await interaction.reply({ content: 'Failed to unban — check the ID and bot permissions.', ephemeral: true });
        }
        return;
      }
      case 'purge': {
        const amount = interaction.options.getInteger('amount');
        try {
          await interaction.channel.bulkDelete(amount, true);
          await interaction.reply({ content: `🧹 Purged ${amount} messages.`, ephemeral: true });
        } catch {
          await interaction.reply({ content: "Failed to purge — messages older than 14 days can't be bulk deleted.", ephemeral: true });
        }
        return;
      }

      // ---------- tags/pfp/profile ----------
      case 'settag': {
        const target = interaction.options.getMember('user') || interaction.member;
        if (target.id !== interaction.member.id && getRankIndex(interaction.user.id) < 3) {
          await interaction.reply({ content: "🚫 You need to be at least **Head Moderator** to set someone else's tag.", ephemeral: true });
          return;
        }
        const newTag = interaction.options.getString('text');
        data.tags[target.id] = { text: newTag, manual: true };
        saveData(data);
        await interaction.reply(`Tag for ${target} set to **${newTag}**.`);
        sendLog(interaction.guild, '🏷️', 'Tag Updated', `${target.user.tag}'s tag was set to "${newTag}".`, interaction.user, 0x9b59b6);
        return;
      }
      case 'setpfp': {
        const url = interaction.options.getString('url');
        if (!/^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)$/i.test(url)) {
          await interaction.reply({ content: 'Must be a direct image/gif link ending in .gif, .png, .jpg, or .webp', ephemeral: true });
          return;
        }
        data.pfps[interaction.user.id] = url;
        saveData(data);
        await interaction.reply('✅ Your profile card image is set. Check it with `/profile`.');
        return;
      }
      case 'profile': {
        const target = interaction.options.getMember('user') || interaction.member;
        const credits = data.credits[target.id] || 0;
        const tag = data.tags[target.id]?.text || computeAutoTag(target.id);
        const rankIndex = getRankIndex(target.id);
        const rankName = rankIndex >= 0 ? RANK_LADDER[rankIndex].name : 'Not on the mod team';
        const warnCount = (data.warns[target.id] || []).length;
        const inactivityWarnCount = data.inactivityWarns[target.id] || 0;
        const pfp = data.pfps[target.id];
        const onBreak = !!data.onBreak[target.id];
        const embed = new EmbedBuilder()
          .setTitle(`📇 ${target.user.tag}`)
          .setThumbnail(target.user.displayAvatarURL())
          .addFields(
            { name: '🏅 Rank', value: rankName, inline: true },
            { name: '📊 Standing', value: tag, inline: true },
            { name: '💳 Credits', value: `${credits}`, inline: true },
            { name: '⚠️ Warns', value: `${warnCount}`, inline: true },
            { name: '🔔 Inactivity', value: `${inactivityWarnCount}/${MAX_INACTIVITY_WARNS}`, inline: true },
            { name: '🌡️ Status', value: onBreak ? '🌴 On break' : '✅ Active', inline: true },
          )
          .setColor(data.profileColor?.[target.id] || colorForTag(tag))
          .setFooter({ text: 'Moderator Profile' });
        if (pfp) embed.setImage(pfp);
        await interaction.reply({ embeds: [embed] });
        return;
      }
      case 'progress': case 'mystats': {
        const target = interaction.options.getMember?.('user') || interaction.member;
        const stats = data.trainingStats[target.id] || { taken: 0, correct: 0 };
        const pct = stats.taken > 0 ? Math.round((stats.correct / stats.taken) * 100) : 0;
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`${target.user.tag}'s Training Progress`)
            .addFields(
              { name: 'Questions Answered', value: `${stats.taken}`, inline: true },
              { name: 'Correct', value: `${stats.correct}`, inline: true },
              { name: 'Accuracy', value: `${pct}%`, inline: true },
            ).setColor(0x9b59b6)],
        });
        return;
      }
      case 'roster': {
        const guild = interaction.guild;
        const grouped = {};
        for (const rank of RANK_LADDER) grouped[rank.name] = [];
        for (const [userId, rankIndex] of Object.entries(data.ranks)) {
          const rankName = RANK_LADDER[rankIndex]?.name;
          if (!rankName) continue;
          const member = await guild.members.fetch(userId).catch(() => null);
          if (!member) continue;
          const tag = data.tags[userId]?.text || computeAutoTag(userId);
          const breakTag = data.onBreak[userId] ? ' 🌴' : '';
          grouped[rankName].push(`• ${member.user.tag} — *${tag}*${breakTag}`);
        }
        const embed = new EmbedBuilder().setTitle('📋 Moderator Team Roster').setColor(0x2ecc71)
          .setFooter({ text: `${Object.keys(data.ranks).length} total moderators` });
        for (const rank of [...RANK_LADDER].reverse()) {
          const members = grouped[rank.name];
          if (members.length > 0) embed.addFields({ name: `🏅 ${rank.name}`, value: members.join('\n') });
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }

      // ---------- ranks ----------
      case 'modoftheday': {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: 'Only admins can trigger this manually.', ephemeral: true });
          return;
        }
        await pickModeratorOfTheDay(interaction.guild);
        await interaction.reply('✅ Moderator of the Day has been announced.');
        return;
      }
      case 'demote': {
        const target = interaction.options.getMember('user');
        const newRank = await demoteMember(interaction.guild, target);
        await interaction.reply(newRank ? `${target} was demoted to **${newRank}**.` : `${target} could not be demoted.`);
        if (newRank) sendLog(interaction.guild, '⬇️', 'Moderator Demoted', `${target.user.tag} was demoted to **${newRank}**.`, interaction.user, 0xc0392b);
        return;
      }
      case 'rankup': {
        const userId = interaction.user.id;
        const guild = interaction.guild;
        const currentIndex = getRankIndex(userId);
        const nextIndex = currentIndex + 1;
        if (currentIndex < 0) { await interaction.reply({ content: "You're not on the moderator team yet.", ephemeral: true }); return; }
        if (nextIndex >= RANK_LADDER.length) { await interaction.reply("You're already at the top rank."); return; }
        const nextRank = RANK_LADDER[nextIndex];
        const credits = data.credits[userId] || 0;
        if (credits < nextRank.cost) { await interaction.reply({ content: `You need ${nextRank.cost} credits for **${nextRank.name}** (you have ${credits}).`, ephemeral: true }); return; }
        const currentRole = findRoleByName(guild, RANK_LADDER[currentIndex].name);
        const nextRole = findRoleByName(guild, nextRank.name);
        if (!nextRole) { await interaction.reply({ content: `Couldn't find a role named "${nextRank.name}" in this server.`, ephemeral: true }); return; }
        try {
          if (currentRole) await interaction.member.roles.remove(currentRole).catch(() => {});
          await interaction.member.roles.add(nextRole);
        } catch {
          await interaction.reply({ content: 'Could not update roles — check bot permissions and role position.', ephemeral: true });
          return;
        }
        data.credits[userId] = credits - nextRank.cost;
        data.ranks[userId] = nextIndex;
        updateTag(userId);
        saveData(data);
        await interaction.reply(`🎉 You've been promoted to **${nextRank.name}**! Remaining credits: ${data.credits[userId]}.`);
        sendLog(guild, '⬆️', 'Moderator Promoted', `${interaction.user.tag} was promoted to **${nextRank.name}**.`, interaction.user, 0x2ecc71);
        return;
      }
      case 'rankmod': {
        const requestedRankName = interaction.options.getString('rank');
        const requestedRankIndex = RANK_LADDER.findIndex((r) => r.name === requestedRankName);
        const targets = ['user1', 'user2', 'user3', 'user4', 'user5']
          .map((k) => interaction.options.getMember(k))
          .filter(Boolean);

        if (targets.length === 0 || requestedRankIndex === -1) {
          await interaction.reply({ content: 'Provide at least one user and a valid rank.', ephemeral: true });
          return;
        }

        const isServerAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
        const callerRankIndex = getRankIndex(interaction.user.id);

        if (!isServerAdmin && callerRankIndex < RANK_REQUIREMENTS.rankmod) {
          await interaction.reply({ content: `🚫 You need to be at least **${RANK_LADDER[RANK_REQUIREMENTS.rankmod].name}** to use this command.`, ephemeral: true });
          return;
        }
        if (!isServerAdmin && requestedRankIndex >= callerRankIndex) {
          await interaction.reply({ content: `🚫 You can only assign ranks below your own (**${RANK_LADDER[callerRankIndex].name}**).`, ephemeral: true });
          return;
        }

        const guild = interaction.guild;
        const newRole = findRoleByName(guild, requestedRankName);
        if (!newRole) {
          await interaction.reply({ content: `Couldn't find a role named "${requestedRankName}" — check it exists and matches exactly.`, ephemeral: true });
          return;
        }

        const results = [];
        for (const target of targets) {
          const oldIndex = getRankIndex(target.id);
          if (oldIndex === requestedRankIndex) {
            results.push(`${target.user.tag} — already ${requestedRankName}`);
            continue;
          }
          const oldRole = oldIndex >= 0 ? findRoleByName(guild, RANK_LADDER[oldIndex].name) : null;
          try {
            if (oldRole) await target.roles.remove(oldRole).catch(() => {});
            await target.roles.add(newRole);
          } catch {
            results.push(`${target.user.tag} — failed (check role position/permissions)`);
            continue;
          }
          data.ranks[target.id] = requestedRankIndex;
          data.credits[target.id] = data.credits[target.id] || 0;
          markActive(target.id);
          updateTag(target.id);
          const verb = oldIndex === -1 ? 'joined the team as' : (requestedRankIndex > oldIndex ? 'promoted to' : 'moved to');
          results.push(`${target.user.tag} — ${verb} ${requestedRankName}`);
        }
        saveData(data);

        await interaction.reply(`**Rank update — ${requestedRankName}:**\n${results.join('\n')}`);
        sendLog(guild, '🆕', 'Rank(s) Assigned', `${requestedRankName} assigned:\n${results.join('\n')}`, interaction.user, 0x3498db);
        return;
      }
      case 'setrank': {
        const target = interaction.options.getMember('user');
        const rankName = interaction.options.getString('rank');
        const rankIndex = RANK_LADDER.findIndex((r) => r.name === rankName);
        const guild = interaction.guild;
        const oldIndex = getRankIndex(target.id);
        const oldRole = oldIndex >= 0 ? findRoleByName(guild, RANK_LADDER[oldIndex].name) : null;
        const newRole = findRoleByName(guild, RANK_LADDER[rankIndex].name);
        if (!newRole) { await interaction.reply({ content: `Couldn't find a role named "${RANK_LADDER[rankIndex].name}".`, ephemeral: true }); return; }
        try {
          if (oldRole) await target.roles.remove(oldRole).catch(() => {});
          await target.roles.add(newRole);
        } catch {
          await interaction.reply({ content: 'Failed to update roles — check bot permissions and role position.', ephemeral: true });
          return;
        }
        data.ranks[target.id] = rankIndex;
        markActive(target.id);
        updateTag(target.id);
        saveData(data);
        await interaction.reply(`✅ ${target}'s rank was set to **${RANK_LADDER[rankIndex].name}**.`);
        sendLog(guild, '🔧', 'Rank Manually Set', `${target.user.tag}'s rank was set to **${RANK_LADDER[rankIndex].name}**.`, interaction.user, 0x9b59b6);
        return;
      }

      // ---------- training ----------
      case 'training': {
        if (activeSessions.has(interaction.user.id)) {
          await interaction.reply({ content: 'You already have a training session in progress.', ephemeral: true });
          return;
        }
        activeSessions.add(interaction.user.id);
        let score = 0;
        const shuffledQuiz = shuffle(quiz);
        await interaction.reply(`📘 Starting moderator rule training (${shuffledQuiz.length} questions, order randomized). 30 seconds per question.`);

        for (const item of shuffledQuiz) {
          await interaction.channel.send(item.q);
          try {
            const collected = await interaction.channel.awaitMessages({
              filter: (m) => m.author.id === interaction.user.id,
              max: 1, time: 30000, errors: ['time'],
            });
            const answer = collected.first().content.toLowerCase();
            const correctKeywords = item.a.toLowerCase().split(' ');
            const isClose = correctKeywords.some((w) => w.length > 3 && answer.includes(w));
            recordTrainingResult(interaction.user.id, isClose);
            if (isClose) {
              score++;
              addCredits(interaction.user.id, CREDIT_REWARDS.correctAnswer);
              await interaction.channel.send(`✅ Correct-ish. ${item.rule} (+${CREDIT_REWARDS.correctAnswer} credits)`);
            } else {
              await interaction.channel.send(`❌ Not quite. ${item.rule}`);
            }
          } catch {
            recordTrainingResult(interaction.user.id, false);
            await interaction.channel.send(`⏱️ Time's up. ${item.rule}`);
          }
        }
        activeSessions.delete(interaction.user.id);
        await interaction.channel.send(`🏁 Training complete! ${interaction.user} scored **${score}/${shuffledQuiz.length}**.`);
        return;
      }
      case 'trainingexamples': {
        const sample = quiz.slice(0, 3);
        const lines = sample.map((item, i) => `**${i + 1}.** ${item.q}\n   *Expected answer:* ${item.a}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📖 Training Question Examples').setDescription(lines.join('\n\n')).setColor(0x3498db)] });
        return;
      }
      case 'trainingrules': {
        const lines = quiz.map((item) => `• ${item.rule}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📜 Full Rule Book').setDescription(lines.join('\n')).setColor(0xe67e22)] });
        return;
      }

      // ---------- extras ----------
      case 'ping': {
        await interaction.reply('Pinging...');
        const sent = await interaction.fetchReply();
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply(`🏓 Pong! Latency: ${latency}ms | API: ${Math.round(client.ws.ping)}ms`);
        return;
      }
      case 'uptime': {
        const upMs = Date.now() - START_TIME;
        const hours = Math.floor(upMs / 3600000);
        const mins = Math.floor((upMs % 3600000) / 60000);
        await interaction.reply(`⏱️ Bot has been online for ${hours}h ${mins}m.`);
        return;
      }
      case 'serverinfo': {
        const guild = interaction.guild;
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(guild.name)
            .addFields(
              { name: 'Members', value: `${guild.memberCount}`, inline: true },
              { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
              { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            ).setThumbnail(guild.iconURL()).setColor(0x5865f2)],
        });
        return;
      }
      case 'userinfo': {
        const target = interaction.options.getMember('user') || interaction.member;
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(target.user.tag)
            .addFields(
              { name: 'Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
              { name: 'Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
              { name: 'Roles', value: `${target.roles.cache.size - 1}`, inline: true },
            ).setThumbnail(target.user.displayAvatarURL()).setColor(0x5865f2)],
        });
        return;
      }
      case 'avatar': {
        const target = interaction.options.getMember('user') || interaction.member;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${target.user.tag}'s Avatar`).setImage(target.user.displayAvatarURL({ size: 512 })).setColor(0x5865f2)] });
        return;
      }
      case 'embed': {
        const text = interaction.options.getString('text');
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(text).setColor(0x5865f2)] });
        return;
      }
      case 'feedback': {
        const text = interaction.options.getString('message');
        sendLog(interaction.guild, '📝', 'New Feedback', text, interaction.user, 0x9b59b6);
        await interaction.reply({ content: '✅ Thanks — your feedback has been logged.', ephemeral: true });
        return;
      }
      default:
        await interaction.reply({ content: 'Unrecognized command.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Something went wrong running that command.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Something went wrong running that command.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.BOT_TOKEN);
