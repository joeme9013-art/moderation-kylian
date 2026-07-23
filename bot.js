require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = '?';
// Points at a Railway Volume mount if RAILWAY_VOLUME_MOUNT_PATH is set (persists across redeploys),
// otherwise falls back to a local file for testing on your own machine.
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';
const GUILD_ID = '1324059331406069872';
const MOD_OF_THE_DAY_CHANNEL_ID = '1528326035605819402';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const AUTO_TRAINING_CHANNEL_ID = '1528327903371202653';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
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

// ---------- Commands list (alphabetical, shown by ?help) ----------
const commands = [
  'addcredits', 'avatar', 'balance', 'ban', 'break', 'buy', 'claim',
  'clearwarns', 'createtag', 'demote', 'embed', 'feedback', 'kick',
  'majorwarn', 'minorwarn', 'modoftheday', 'mute', 'mystats',
  'modoftheday', 'ping', 'profile', 'progress', 'purge', 'rankmod',
  'rankup', 'removecredits', 'richlist', 'roster', 'serverinfo',
  'setpfp', 'setrank', 'settag', 'setup', 'shop', 'training',
  'trainingexamples', 'trainingrp', 'trainingrules', 'unban', 'unbreak',
  'unmute', 'uptime', 'userinfo', 'warn', 'warnings',
];
// de-dupe just in case
const uniqueCommands = [...new Set(commands)];

// ---------- Credit rewards ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };

function addCredits(userId, amount) {
  let finalAmount = amount;
  if (amount > 0 && data.creditBoost?.[userId]) {
    finalAmount = amount * 2;
    delete data.creditBoost[userId]; // one-time use
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
const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' },
  { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' },
];
function computeAutoTag(credits) {
  let current = TAG_THRESHOLDS[0].tag;
  for (const t of TAG_THRESHOLDS) if (credits >= t.min) current = t.tag;
  return current;
}
function updateTag(userId) {
  if (data.tags[userId]?.manual) return;
  const credits = data.credits[userId] || 0;
  data.tags[userId] = { text: computeAutoTag(credits), manual: false };
}

// ---------- Rank ladder — looked up by ROLE NAME, no IDs needed ----------
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
// Roles excluded from the auto-training ping (top two ranks)
const PING_EXCLUDED_RANKS = ['Assistant Server Manager', 'Server Manager'];

function getRankIndex(userId) {
  return data.ranks[userId] ?? -1;
}
function findRoleByName(guild, name) {
  return guild.roles.cache.find((r) => r.name === name) || null;
}
function buildTrainingPingString(guild) {
  const mentions = [];
  for (const rank of RANK_LADDER) {
    if (PING_EXCLUDED_RANKS.includes(rank.name)) continue;
    const role = findRoleByName(guild, rank.name);
    if (role) mentions.push(`<@&${role.id}>`);
  }
  return mentions.join(' ');
}

// ---------- Shop — practical perks for moderators, not just cosmetics ----------
// type determines what ?buy actually does:
//   'removeWarn'   — removes the target's oldest warn from their record
//   'breakPass'    — grants a 48h inactivity-check exemption without needing ?break
//   'creditBoost'  — next single mod action (mute/kick/ban) or training answer pays double
//   'profileColor' — sets a custom embed color on their ?profile card
//   'tag'          — sets a manual tag on their profile (the old cosmetic option, kept as the cheapest tier)
const SHOP_ITEMS = [
  { id: 'tag-veteran', name: 'Veteran Tag', cost: 60, type: 'tag', tagText: '🎖️ Veteran Moderator' },
  { id: 'warn-clear', name: 'Warning Removal Token', cost: 120, type: 'removeWarn',
    desc: 'Removes your oldest warn from your record.' },
  { id: 'break-pass', name: '48h Break Pass', cost: 100, type: 'breakPass',
    desc: 'Skips inactivity checks for 48 hours — no need to use ?break.' },
  { id: 'credit-boost', name: 'Double Credits Token', cost: 150, type: 'creditBoost',
    desc: 'Your next mod action or training answer pays double credits.' },
  { id: 'profile-gold', name: 'Gold Profile Color', cost: 200, type: 'profileColor', color: 0xffd700,
    desc: 'Gives your ?profile card a gold accent color.' },
  { id: 'profile-crimson', name: 'Crimson Profile Color', cost: 200, type: 'profileColor', color: 0xdc143c,
    desc: 'Gives your ?profile card a crimson accent color.' },
  { id: 'tag-elite', name: 'Elite Tag', cost: 350, type: 'tag', tagText: '👑 Elite Team Member' },
];

// ---------- One-time seed: initial moderator roster ----------
// Applied once on first boot (guarded by data.config.seeded) so it never
// overwrites progress on later restarts/redeploys.
const SEED_MODERATORS = [
  { userId: '1446192510593662976', rankName: 'Senior Moderator', credits: 250 },
  { userId: '1320483185636802592', rankName: 'Moderator', credits: 0 },
  { userId: '1222684836091658330', rankName: 'Server Manager', credits: 0 },
  { userId: '1198527966972477505', rankName: 'Server Manager', credits: 0 },
];

async function seedInitialModerators(guild) {
  if (data.config.seeded) return; // already done, never repeat this even across redeploys

  for (const entry of SEED_MODERATORS) {
    const rankIndex = RANK_LADDER.findIndex((r) => r.name === entry.rankName);
    if (rankIndex === -1) continue;

    const member = await guild.members.fetch(entry.userId).catch(() => null);
    const role = findRoleByName(guild, entry.rankName);

    if (member && role) {
      await member.roles.add(role).catch(() => {});
    }

    data.ranks[entry.userId] = rankIndex;
    data.credits[entry.userId] = entry.credits;
    data.lastActive[entry.userId] = Date.now();
    updateTag(entry.userId);
  }

  data.config.seeded = true;
  saveData(data);
  console.log('Seeded initial moderator roster.');
}

// ---------- Permission requirements per command (minimum rank index) ----------
const RANK_REQUIREMENTS = {
  mute: 0, unmute: 0, warn: 0, minorwarn: 0,
  kick: 1, majorwarn: 1, purge: 1,
  ban: 2, clearwarns: 2,
  unban: 5, addcredits: 5, removecredits: 5, demote: 5,
  embed: 3,
  setrank: 7, rankmod: 7,
};
function hasRequiredRank(userId, command) {
  const required = RANK_REQUIREMENTS[command];
  if (required === undefined) return true;
  return getRankIndex(userId) >= required;
}
function checkRankGate(message, command) {
  if (RANK_REQUIREMENTS[command] === undefined) return true;
  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  if (isAdmin) return true;
  if (!hasRequiredRank(message.author.id, command)) {
    const requiredRankName = RANK_LADDER[RANK_REQUIREMENTS[command]].name;
    message.reply(`🚫 You need to be at least **${requiredRankName}** to use \`${PREFIX}${command}\`.`);
    return false;
  }
  return true;
}

// ---------- Warn durations (in weeks) ----------
const WARN_DURATIONS = { warn: 2, minorwarn: 1, majorwarn: 3 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ---------- Mute duration presets ----------
// Usage: ?mute @user 10m   (defaults to 10m if no duration given or duration not recognized)
const MUTE_DURATIONS = {
  '1m': 1 * 60 * 1000,
  '5m': 5 * 60 * 1000,
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};
const DEFAULT_MUTE_MS = MUTE_DURATIONS['10m'];

async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) {
    message.reply(`Mention someone to warn, e.g. \`${PREFIX}${type} @user\`.`);
    return;
  }
  const weeks = WARN_DURATIONS[type];
  const ms = weeks * WEEK_MS;

  try {
    await target.timeout(ms, `${type} issued by ${message.author.tag}`);
  } catch {
    message.reply('Failed to timeout that member (check role hierarchy/permissions).');
    return;
  }

  data.warns[target.id] = data.warns[target.id] || [];
  data.warns[target.id].push({ type, by: message.author.id, at: Date.now(), expiresAt: Date.now() + ms });
  saveData(data);

  message.reply(`${target} has been given a **${type}** — timed out for ${weeks} week(s).`);
  getLogChannel(message.guild)?.send(`📋 ${target} received a **${type}** from ${message.author} (${weeks} week timeout).`);
}

// ---------- Demotion ----------
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

// ---------- Inactivity check (skips anyone on break) ----------
async function checkInactivity(guild) {
  const logChannel = getLogChannel(guild);
  const now = Date.now();

  for (const userId of Object.keys(data.ranks)) {
    if (data.onBreak[userId]) {
      // If this break came from a purchased 48h pass, auto-clear it once expired
      const passExpiry = data.breakPassExpires?.[userId];
      if (passExpiry && Date.now() >= passExpiry) {
        delete data.onBreak[userId];
        delete data.breakPassExpires[userId];
        data.lastActive[userId] = Date.now();
        saveData(data);
      } else {
        continue; // still on break (manual or unexpired pass) — skip entirely
      }
    }

    const rankIndex = getRankIndex(userId);
    if (rankIndex <= 0) continue;

    const last = data.lastActive[userId] || 0;
    if (now - last < INACTIVITY_THRESHOLD_MS) continue;

    data.inactivityWarns[userId] = (data.inactivityWarns[userId] || 0) + 1;
    const warnCount = data.inactivityWarns[userId];

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    if (warnCount >= MAX_INACTIVITY_WARNS) {
      const newRank = await demoteMember(guild, member);
      data.inactivityWarns[userId] = 0;
      data.lastActive[userId] = now;
      saveData(data);

      const msg = newRank
        ? `⬇️ ${member} was demoted to **${newRank}** for inactivity.`
        : `${member} hit max inactivity warnings but is already at the lowest rank.`;
      logChannel?.send(msg);
      member.send(msg).catch(() => {});
    } else {
      saveData(data);
      const msg = `⚠️ ${member}, inactivity warning **${warnCount}/${MAX_INACTIVITY_WARNS}** — any command or mod action resets this. On break? Use \`${PREFIX}break\`.`;
      logChannel?.send(msg);
      member.send(msg).catch(() => {});
    }
  }
}

// ---------- Moderator of the Day ----------
async function pickModeratorOfTheDay(guild) {
  const channel = guild.channels.cache.get(MOD_OF_THE_DAY_CHANNEL_ID);
  if (!channel) return;

  const entries = Object.entries(data.dailyCredits).filter(([, amt]) => amt > 0);
  if (entries.length === 0) {
    data.dailyCredits = {};
    saveData(data);
    return;
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [winnerId, winnerCredits] = entries[0];
  const member = await guild.members.fetch(winnerId).catch(() => null);

  if (member) {
    addCredits(winnerId, MOD_OF_DAY_BONUS);
    const tag = data.tags[winnerId]?.text || computeAutoTag(data.credits[winnerId] || 0);
    const embed = new EmbedBuilder()
      .setTitle('🏆 Moderator of the Day')
      .setDescription(`${member} earned **${winnerCredits} credits** today — the most of any moderator!`)
      .addFields({ name: 'Current Tag', value: tag, inline: true })
      .setColor(0xffd700)
      .setThumbnail(member.user.displayAvatarURL());
    channel.send({ embeds: [embed] });
  }

  data.dailyCredits = {};
  saveData(data);
}

// ---------- Random-timed auto-training (pings all ranks except top 2) ----------
async function runAutoTraining(guild) {
  const channel = guild.channels.cache.get(AUTO_TRAINING_CHANNEL_ID);
  if (!channel) return;

  const item = quiz[Math.floor(Math.random() * quiz.length)];
  const pingString = buildTrainingPingString(guild);

  await channel.send(
    `${pingString}\n📚 **Surprise Training Question!** First correct answer wins credits.\n${item.q}\nYou have 60 seconds.`
  );

  try {
    const collected = await channel.awaitMessages({
      filter: (m) => !m.author.bot && data.ranks[m.author.id] !== undefined,
      max: 1,
      time: AUTO_TRAIN_ANSWER_WINDOW_MS,
      errors: ['time'],
    });

    const responder = collected.first();
    const answer = responder.content.toLowerCase();
    const correctKeywords = item.a.toLowerCase().split(' ');
    const isClose = correctKeywords.some((w) => w.length > 3 && answer.includes(w));

    recordTrainingResult(responder.author.id, isClose);

    if (isClose) {
      addCredits(responder.author.id, CREDIT_REWARDS.correctAnswer);
      channel.send(`✅ ${responder.author} got it right! ${item.rule} (+${CREDIT_REWARDS.correctAnswer} credits)`);
    } else {
      channel.send(`❌ Not quite. ${item.rule}`);
    }
  } catch {
    channel.send(`⏱️ No one answered in time. ${item.rule}`);
  }
}

function scheduleNextAutoTraining(guild) {
  const gap = AUTO_TRAIN_MIN_GAP_MS + Math.random() * (AUTO_TRAIN_MAX_GAP_MS - AUTO_TRAIN_MIN_GAP_MS);
  setTimeout(async () => {
    await runAutoTraining(guild);
    scheduleNextAutoTraining(guild);
  }, gap);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
  if (guild) {
    seedInitialModerators(guild);
    setInterval(() => checkInactivity(guild), CHECK_INTERVAL_MS);
    setInterval(() => pickModeratorOfTheDay(guild), CHECK_INTERVAL_MS);
    scheduleNextAutoTraining(guild);
  }
});

// ---------- Main handler ----------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift();

  if (uniqueCommands.includes(command)) markActive(message.author.id);
  if (!checkRankGate(message, command)) return;

  // ---------- help ----------
  if (command === 'help') {
    const list = [...uniqueCommands].sort().join('\n  ');
    message.reply(
      '```\n' + 'No Category:\n' + `  ${list}\n\n` +
      `Type ${PREFIX}help command for more info on a command.\n` + '```'
    );
    return;
  }

  // ---------- setup ----------
  if (command === 'setup') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      message.reply('Only server admins can run setup.');
      return;
    }
    const sub = args[0];
    if (sub === 'logchannel') {
      const channel = message.mentions.channels.first();
      if (!channel) {
        message.reply(`Usage: \`${PREFIX}setup logchannel #channel\``);
        return;
      }
      data.config.logChannelId = channel.id;
      saveData(data);
      message.reply(`✅ Logging will now post in ${channel}.`);
      return;
    }
    message.reply(`Usage: \`${PREFIX}setup logchannel #channel\``);
    return;
  }

  // ---------- break / unbreak ----------
  if (command === 'break') {
    if (getRankIndex(message.author.id) < 0) {
      message.reply("You're not on the moderator team, so there's no inactivity tracking to pause.");
      return;
    }
    if (data.onBreak[message.author.id]) {
      message.reply("You're already marked as on break.");
      return;
    }
    data.onBreak[message.author.id] = Date.now();
    saveData(data);
    message.reply('🌴 You are now on break — inactivity warnings are fully paused. Use `?unbreak` when you\'re back.');
    getLogChannel(message.guild)?.send(`🌴 ${message.author} started a break.`);
    return;
  }
  if (command === 'unbreak') {
    if (!data.onBreak[message.author.id]) {
      message.reply("You're not currently on break.");
      return;
    }
    delete data.onBreak[message.author.id];
    markActive(message.author.id);
    saveData(data);
    message.reply('👋 Welcome back! Inactivity tracking has resumed.');
    getLogChannel(message.guild)?.send(`👋 ${message.author} ended their break.`);
    return;
  }

  // ---------- economy ----------
  if (command === 'claim') {
    const last = data.lastClaim[message.author.id] || 0;
    const elapsed = Date.now() - last;
    if (elapsed < CLAIM_COOLDOWN_MS) {
      const hoursLeft = Math.ceil((CLAIM_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
      message.reply(`⏳ You've already claimed today. Try again in about ${hoursLeft} hour(s).`);
      return;
    }
    data.lastClaim[message.author.id] = Date.now();
    addCredits(message.author.id, CLAIM_AMOUNT);
    saveData(data);
    message.reply(`💰 You claimed your daily **${CLAIM_AMOUNT} credits**! New balance: ${data.credits[message.author.id]}.`);
    return;
  }

  if (command === 'balance') {
    const target = message.mentions.members.first() || message.member;
    message.reply(`💳 ${target === message.member ? 'Your' : `${target.user.tag}'s`} balance: **${data.credits[target.id] || 0} credits**.`);
    return;
  }

  if (command === 'richlist') {
    const sorted = Object.entries(data.credits).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) {
      message.reply('No one has earned credits yet.');
      return;
    }
    const lines = await Promise.all(sorted.map(async ([userId, amt], i) => {
      const member = await message.guild.members.fetch(userId).catch(() => null);
      return `**${i + 1}.** ${member ? member.user.tag : 'Unknown user'} — ${amt} credits`;
    }));
    const embed = new EmbedBuilder().setTitle('💰 Richlist').setDescription(lines.join('\n')).setColor(0xf1c40f);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'addcredits' || command === 'removecredits') {
    const target = message.mentions.members.first();
    const amount = parseInt(args[1], 10);
    if (!target || isNaN(amount) || amount <= 0) {
      message.reply(`Usage: \`${PREFIX}${command} @user <amount>\``);
      return;
    }
    const delta = command === 'addcredits' ? amount : -amount;
    addCredits(target.id, delta);
    message.reply(`${command === 'addcredits' ? '➕' : '➖'} ${target.user.tag}'s credits ${command === 'addcredits' ? 'increased' : 'decreased'} by ${amount}. New total: ${data.credits[target.id] || 0}.`);
    getLogChannel(message.guild)?.send(`💳 ${message.author} ${command === 'addcredits' ? 'added' : 'removed'} ${amount} credits ${command === 'addcredits' ? 'to' : 'from'} ${target}.`);
    return;
  }

  // ---------- shop ----------
  if (command === 'shop') {
    const lines = SHOP_ITEMS.map((item) =>
      `**${item.id}** — ${item.name} (${item.cost} credits)\n   ${item.desc || `Sets your tag to "${item.tagText}"`}`
    );
    const embed = new EmbedBuilder()
      .setTitle('🛒 Moderator Perk Shop')
      .setDescription(lines.join('\n\n') + `\n\nBuy with \`${PREFIX}buy <item id>\``)
      .setColor(0x1abc9c);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'buy') {
    const itemId = args[0];
    const item = SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      message.reply(`Item not found. Check \`${PREFIX}shop\` for valid item IDs.`);
      return;
    }
    const credits = data.credits[message.author.id] || 0;
    if (credits < item.cost) {
      message.reply(`You need ${item.cost} credits for **${item.name}** (you have ${credits}).`);
      return;
    }
    data.credits[message.author.id] = credits - item.cost;
    data.ownedItems[message.author.id] = data.ownedItems[message.author.id] || [];
    if (!data.ownedItems[message.author.id].includes(item.id)) {
      data.ownedItems[message.author.id].push(item.id);
    }

    let resultMsg = `✅ You bought **${item.name}**!`;

    if (item.type === 'tag') {
      data.tags[message.author.id] = { text: item.tagText, manual: true };
      resultMsg += ` Your tag is now: ${item.tagText}`;
    } else if (item.type === 'removeWarn') {
      const warns = data.warns[message.author.id] || [];
      if (warns.length === 0) {
        resultMsg += ` You had no warns to remove — token saved for later use is not supported, so this purchase had no effect. Consider asking a Head Moderator+ for a refund.`;
      } else {
        warns.shift(); // removes the oldest warn
        data.warns[message.author.id] = warns;
        resultMsg += ` Your oldest warn was removed.`;
      }
    } else if (item.type === 'breakPass') {
      data.onBreak[message.author.id] = Date.now();
      data.breakPassExpires = data.breakPassExpires || {};
      data.breakPassExpires[message.author.id] = Date.now() + 48 * 60 * 60 * 1000;
      resultMsg += ` You're exempt from inactivity checks for the next 48 hours.`;
    } else if (item.type === 'creditBoost') {
      data.creditBoost = data.creditBoost || {};
      data.creditBoost[message.author.id] = true;
      resultMsg += ` Your next mod action or training answer will pay double credits.`;
    } else if (item.type === 'profileColor') {
      data.profileColor = data.profileColor || {};
      data.profileColor[message.author.id] = item.color;
      resultMsg += ` Your profile card now uses this color.`;
    }

    saveData(data);
    message.reply(resultMsg);
    return;
  }

  // ---------- warn commands ----------
  if (command === 'warn' || command === 'minorwarn' || command === 'majorwarn') {
    await applyWarn(message, command);
    return;
  }

  if (command === 'warnings') {
    const target = message.mentions.members.first() || message.member;
    const warns = data.warns[target.id] || [];
    if (warns.length === 0) {
      message.reply(`${target} has no warns on record.`);
      return;
    }
    const lines = warns.map((w, i) => `**${i + 1}.** ${w.type} — issued <t:${Math.floor(w.at / 1000)}:R>`);
    const embed = new EmbedBuilder().setTitle(`${target.user.tag}'s Warnings`).setDescription(lines.join('\n')).setColor(0xe74c3c);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'clearwarns') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Usage: \`${PREFIX}clearwarns @user\``);
      return;
    }
    data.warns[target.id] = [];
    saveData(data);
    message.reply(`✅ Cleared all warns for ${target}.`);
    getLogChannel(message.guild)?.send(`🧹 ${message.author} cleared all warns for ${target}.`);
    return;
  }

  // ---------- mute/kick/ban/unmute/unban ----------
  if (command === 'mute' || command === 'kick' || command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Mention someone, e.g. \`${PREFIX}${command} @user${command === 'mute' ? ' [duration]' : ''}\`.`);
      return;
    }
    try {
      if (command === 'mute') {
        const durationArg = args[1]?.toLowerCase();
        const ms = MUTE_DURATIONS[durationArg] || DEFAULT_MUTE_MS;
        await target.timeout(ms, `Muted by ${message.author.tag}`);
        addCredits(message.author.id, CREDIT_REWARDS.mute);
        const label = durationArg && MUTE_DURATIONS[durationArg] ? durationArg : '10m (default)';
        message.reply(`${target.user.tag} was muted for **${label}**. You earned ${CREDIT_REWARDS.mute} credits.`);
        return;
      }
      if (command === 'kick') await target.kick(`Kicked by ${message.author.tag}`);
      if (command === 'ban') await target.ban({ reason: `Banned by ${message.author.tag}` });
    } catch {
      message.reply('Action failed — check bot permissions/role hierarchy.');
      return;
    }
    addCredits(message.author.id, CREDIT_REWARDS[command]);
    message.reply(`${target.user.tag} was ${command}d. You earned ${CREDIT_REWARDS[command]} credits.`);
    return;
  }

  if (command === 'unmute') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Usage: \`${PREFIX}unmute @user\``);
      return;
    }
    try {
      await target.timeout(null, `Unmuted by ${message.author.tag}`);
      message.reply(`${target} has been unmuted.`);
    } catch {
      message.reply('Failed to unmute — check bot permissions.');
    }
    return;
  }

  if (command === 'unban') {
    const userId = args[0]?.replace(/[<@!>]/g, '');
    if (!userId) {
      message.reply(`Usage: \`${PREFIX}unban <user ID>\``);
      return;
    }
    try {
      await message.guild.members.unban(userId, `Unbanned by ${message.author.tag}`);
      message.reply(`✅ Unbanned user ID ${userId}.`);
      getLogChannel(message.guild)?.send(`🔓 ${message.author} unbanned <@${userId}>.`);
    } catch {
      message.reply('Failed to unban — check the ID and bot permissions.');
    }
    return;
  }

  if (command === 'purge') {
    const amount = parseInt(args[0], 10);
    if (!amount || amount < 1 || amount > 100) {
      message.reply(`Usage: \`${PREFIX}purge <1-100>\``);
      return;
    }
    try {
      await message.channel.bulkDelete(amount + 1, true);
      const confirmMsg = await message.channel.send(`🧹 Purged ${amount} messages.`);
      setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);
    } catch {
      message.reply('Failed to purge — messages older than 14 days can\'t be bulk deleted.');
    }
    return;
  }

  // ---------- tags/pfp/profile ----------
  if (command === 'settag') {
    const target = message.mentions.members.first() || message.member;
    if (target.id !== message.author.id && getRankIndex(message.author.id) < 3) {
      message.reply('🚫 You need to be at least **Head Moderator** to set someone else\'s tag.');
      return;
    }
    const newTag = message.mentions.members.first() ? args.slice(1).join(' ').trim() : args.join(' ').trim();
    if (!newTag) {
      message.reply(`Usage: \`${PREFIX}settag <text>\` or \`${PREFIX}settag @user <text>\``);
      return;
    }
    data.tags[target.id] = { text: newTag, manual: true };
    saveData(data);
    message.reply(`Tag for ${target} set to **${newTag}**.`);
    getLogChannel(message.guild)?.send(`🏷️ ${target}'s tag was set to **${newTag}** by ${message.author}.`);
    return;
  }

  if (command === 'setpfp') {
    const url = args[0];
    if (!url || !/^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)$/i.test(url)) {
      message.reply(`Usage: \`${PREFIX}setpfp <direct image/gif link>\` — must end in .gif, .png, .jpg, or .webp`);
      return;
    }
    data.pfps[message.author.id] = url;
    saveData(data);
    message.reply(`✅ Your profile card image is set. Check it with \`${PREFIX}profile\`.`);
    return;
  }

  if (command === 'profile') {
    const target = message.mentions.members.first() || message.member;
    const credits = data.credits[target.id] || 0;
    const tag = data.tags[target.id]?.text || computeAutoTag(0);
    const rankIndex = getRankIndex(target.id);
    const rankName = rankIndex >= 0 ? RANK_LADDER[rankIndex].name : 'Not on the mod team';
    const warnCount = (data.warns[target.id] || []).length;
    const inactivityWarnCount = data.inactivityWarns[target.id] || 0;
    const pfp = data.pfps[target.id];
    const onBreak = !!data.onBreak[target.id];

    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        { name: 'Rank', value: rankName, inline: true },
        { name: 'Tag', value: tag, inline: true },
        { name: 'Credits', value: `${credits}`, inline: true },
        { name: 'Warns on record', value: `${warnCount}`, inline: true },
        { name: 'Inactivity warnings', value: `${inactivityWarnCount}/${MAX_INACTIVITY_WARNS}`, inline: true },
        { name: 'Status', value: onBreak ? '🌴 On break' : '✅ Active', inline: true },
      )
      .setColor(data.profileColor?.[target.id] || 0x5865f2);
    if (pfp) embed.setImage(pfp);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'progress' || command === 'mystats') {
    const target = message.mentions.members.first() || message.member;
    const stats = data.trainingStats[target.id] || { taken: 0, correct: 0 };
    const pct = stats.taken > 0 ? Math.round((stats.correct / stats.taken) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Training Progress`)
      .addFields(
        { name: 'Questions Answered', value: `${stats.taken}`, inline: true },
        { name: 'Correct', value: `${stats.correct}`, inline: true },
        { name: 'Accuracy', value: `${pct}%`, inline: true },
      )
      .setColor(0x9b59b6);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'roster') {
    const guild = message.guild;
    const grouped = {};
    for (const rank of RANK_LADDER) grouped[rank.name] = [];

    for (const [userId, rankIndex] of Object.entries(data.ranks)) {
      const rankName = RANK_LADDER[rankIndex]?.name;
      if (!rankName) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      const tag = data.tags[userId]?.text || computeAutoTag(data.credits[userId] || 0);
      const breakTag = data.onBreak[userId] ? ' 🌴' : '';
      grouped[rankName].push(`${member.user.tag} — *${tag}*${breakTag}`);
    }

    const embed = new EmbedBuilder().setTitle('📋 Moderator Team Roster').setColor(0x2ecc71);
    for (const rank of [...RANK_LADDER].reverse()) {
      const members = grouped[rank.name];
      if (members.length > 0) {
        embed.addFields({ name: rank.name, value: members.join('\n') });
      }
    }
    message.reply({ embeds: [embed] });
    return;
  }

  // ---------- ranks ----------
  if (command === 'modoftheday') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      message.reply('Only admins can trigger this manually.');
      return;
    }
    await pickModeratorOfTheDay(message.guild);
    message.reply('✅ Moderator of the Day has been announced.');
    return;
  }

  if (command === 'demote') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Usage: \`${PREFIX}demote @user\``);
      return;
    }
    const newRank = await demoteMember(message.guild, target);
    message.reply(newRank ? `${target} was demoted to **${newRank}**.` : `${target} could not be demoted.`);
    if (newRank) getLogChannel(message.guild)?.send(`⬇️ ${target} was demoted to **${newRank}** by ${message.author}.`);
    return;
  }

  if (command === 'rankup') {
    const userId = message.author.id;
    const guild = message.guild;
    const currentIndex = getRankIndex(userId);
    const nextIndex = currentIndex + 1;

    if (currentIndex < 0) {
      message.reply("You're not on the moderator team yet — talk to an admin about getting started.");
      return;
    }
    if (nextIndex >= RANK_LADDER.length) {
      message.reply("You're already at the top rank.");
      return;
    }

    const nextRank = RANK_LADDER[nextIndex];
    const credits = data.credits[userId] || 0;

    if (credits < nextRank.cost) {
      message.reply(`You need ${nextRank.cost} credits for **${nextRank.name}** (you have ${credits}).`);
      return;
    }

    const currentRole = findRoleByName(guild, RANK_LADDER[currentIndex].name);
    const nextRole = findRoleByName(guild, nextRank.name);
    if (!nextRole) {
      message.reply(`Couldn't find a role named "${nextRank.name}" in this server — check the role exists and matches exactly.`);
      return;
    }

    try {
      if (currentRole) await message.member.roles.remove(currentRole).catch(() => {});
      await message.member.roles.add(nextRole);
    } catch {
      message.reply('Could not update roles — check bot permissions and role position.');
      return;
    }

    data.credits[userId] = credits - nextRank.cost;
    data.ranks[userId] = nextIndex;
    updateTag(userId);
    saveData(data);

    message.reply(`🎉 You've been promoted to **${nextRank.name}**! Remaining credits: ${data.credits[userId]}.`);
    getLogChannel(guild)?.send(`⬆️ ${message.author} was promoted to **${nextRank.name}**.`);
    return;
  }

  if (command === 'rankmod') {
    // Induct a brand-new person onto the mod team at Trial Moderator
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Usage: \`${PREFIX}rankmod @user\` — adds them to the team as Trial Moderator.`);
      return;
    }
    if (getRankIndex(target.id) >= 0) {
      message.reply(`${target} is already on the moderator team.`);
      return;
    }
    const role = findRoleByName(message.guild, RANK_LADDER[0].name);
    if (!role) {
      message.reply(`Couldn't find the "${RANK_LADDER[0].name}" role — check it exists.`);
      return;
    }
    try {
      await target.roles.add(role);
    } catch {
      message.reply('Failed to assign the role — check bot permissions and role position.');
      return;
    }
    data.ranks[target.id] = 0;
    data.credits[target.id] = data.credits[target.id] || 0;
    markActive(target.id);
    updateTag(target.id);
    saveData(data);
    message.reply(`✅ ${target} has joined the moderator team as **${RANK_LADDER[0].name}**.`);
    getLogChannel(message.guild)?.send(`🆕 ${target} was added to the mod team as ${RANK_LADDER[0].name} by ${message.author}.`);
    return;
  }

  if (command === 'setrank') {
    const target = message.mentions.members.first();
    const rankName = args.slice(1).join(' ').trim();
    const rankIndex = RANK_LADDER.findIndex((r) => r.name.toLowerCase() === rankName.toLowerCase());
    if (!target || rankIndex === -1) {
      message.reply(`Usage: \`${PREFIX}setrank @user <exact rank name>\` — e.g. \`${PREFIX}setrank @user Senior Moderator\``);
      return;
    }
    const guild = message.guild;
    const oldIndex = getRankIndex(target.id);
    const oldRole = oldIndex >= 0 ? findRoleByName(guild, RANK_LADDER[oldIndex].name) : null;
    const newRole = findRoleByName(guild, RANK_LADDER[rankIndex].name);
    if (!newRole) {
      message.reply(`Couldn't find a role named "${RANK_LADDER[rankIndex].name}" in this server.`);
      return;
    }
    try {
      if (oldRole) await target.roles.remove(oldRole).catch(() => {});
      await target.roles.add(newRole);
    } catch {
      message.reply('Failed to update roles — check bot permissions and role position.');
      return;
    }
    data.ranks[target.id] = rankIndex;
    markActive(target.id);
    updateTag(target.id);
    saveData(data);
    message.reply(`✅ ${target}'s rank was set to **${RANK_LADDER[rankIndex].name}**.`);
    getLogChannel(guild)?.send(`🔧 ${message.author} set ${target}'s rank to **${RANK_LADDER[rankIndex].name}**.`);
    return;
  }

  // ---------- training ----------
  if (command === 'trainingrp' || command === 'training') {
    if (activeSessions.has(message.author.id)) {
      message.reply('You already have a training session in progress.');
      return;
    }
    activeSessions.add(message.author.id);
    let score = 0;
    const shuffledQuiz = shuffle(quiz);

    await message.reply(`📘 Starting moderator rule training (${shuffledQuiz.length} questions, order randomized). 30 seconds per question.`);

    for (const item of shuffledQuiz) {
      await message.channel.send(item.q);
      try {
        const collected = await message.channel.awaitMessages({
          filter: (m) => m.author.id === message.author.id,
          max: 1,
          time: 30000,
          errors: ['time'],
        });
        const answer = collected.first().content.toLowerCase();
        const correctKeywords = item.a.toLowerCase().split(' ');
        const isClose = correctKeywords.some((w) => w.length > 3 && answer.includes(w));

        recordTrainingResult(message.author.id, isClose);

        if (isClose) {
          score++;
          addCredits(message.author.id, CREDIT_REWARDS.correctAnswer);
          await message.channel.send(`✅ Correct-ish. ${item.rule} (+${CREDIT_REWARDS.correctAnswer} credits)`);
        } else {
          await message.channel.send(`❌ Not quite. ${item.rule}`);
        }
      } catch {
        recordTrainingResult(message.author.id, false);
        await message.channel.send(`⏱️ Time's up. ${item.rule}`);
      }
    }

    activeSessions.delete(message.author.id);
    await message.channel.send(`🏁 Training complete! ${message.author} scored **${score}/${shuffledQuiz.length}**.`);
    return;
  }

  if (command === 'trainingexamples') {
    const sample = quiz.slice(0, 3);
    const lines = sample.map((item, i) => `**${i + 1}.** ${item.q}\n   *Expected answer:* ${item.a}`);
    const embed = new EmbedBuilder()
      .setTitle('📖 Training Question Examples')
      .setDescription(lines.join('\n\n'))
      .setColor(0x3498db);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'trainingrules') {
    const lines = quiz.map((item) => `• ${item.rule}`);
    const embed = new EmbedBuilder()
      .setTitle('📜 Full Rule Book')
      .setDescription(lines.join('\n'))
      .setColor(0xe67e22);
    message.reply({ embeds: [embed] });
    return;
  }

  // ---------- extras ----------
  if (command === 'ping') {
    const sent = await message.reply('Pinging...');
    const latency = sent.createdTimestamp - message.createdTimestamp;
    sent.edit(`🏓 Pong! Latency: ${latency}ms | API: ${Math.round(client.ws.ping)}ms`);
    return;
  }

  if (command === 'uptime') {
    const upMs = Date.now() - START_TIME;
    const hours = Math.floor(upMs / 3600000);
    const mins = Math.floor((upMs % 3600000) / 60000);
    message.reply(`⏱️ Bot has been online for ${hours}h ${mins}m.`);
    return;
  }

  if (command === 'serverinfo') {
    const guild = message.guild;
    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .addFields(
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
      )
      .setThumbnail(guild.iconURL())
      .setColor(0x5865f2);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'userinfo') {
    const target = message.mentions.members.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(target.user.tag)
      .addFields(
        { name: 'Joined Server', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:D>`, inline: true },
        { name: 'Account Created', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Roles', value: `${target.roles.cache.size - 1}`, inline: true },
      )
      .setThumbnail(target.user.displayAvatarURL())
      .setColor(0x5865f2);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'avatar') {
    const target = message.mentions.members.first() || message.member;
    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Avatar`)
      .setImage(target.user.displayAvatarURL({ size: 512 }))
      .setColor(0x5865f2);
    message.reply({ embeds: [embed] });
    return;
  }

  if (command === 'embed') {
    const text = args.join(' ').trim();
    if (!text) {
      message.reply(`Usage: \`${PREFIX}embed <text>\``);
      return;
    }
    const embed = new EmbedBuilder().setDescription(text).setColor(0x5865f2);
    await message.delete().catch(() => {});
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'feedback') {
    const text = args.join(' ').trim();
    if (!text) {
      message.reply(`Usage: \`${PREFIX}feedback <your message>\``);
      return;
    }
    getLogChannel(message.guild)?.send(`📝 Feedback from ${message.author.tag}: ${text}`);
    message.reply('✅ Thanks — your feedback has been logged.');
    return;
  }
});

client.login(process.env.BOT_TOKEN);
