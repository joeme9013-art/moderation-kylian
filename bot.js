require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
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
const DATA_FILE = './data.json';
const LOG_CHANNEL_ID = '1529221027899379722';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const MAX_INACTIVITY_WARNS = 3;

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {};
  parsed.inactivityWarns ??= {};
  return parsed;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let data = loadData();

// ---------- Commands list ----------
const commands = [
  'ban', 'createtag', 'demote', 'feedback', 'kick', 'majorwarn',
  'minorwarn', 'mute', 'profile', 'rankup', 'settag', 'trainingrp', 'warn',
];

// ---------- Credit rewards ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };

function addCredits(userId, amount) {
  data.credits[userId] = (data.credits[userId] || 0) + amount;
  updateTag(userId);
  saveData(data);
}

function markActive(userId) {
  data.lastActive[userId] = Date.now();
  if (data.inactivityWarns[userId]) {
    data.inactivityWarns[userId] = 0;
  }
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

// ---------- Rank ladder ----------
// Fill in real role IDs from your server before using.
const RANK_LADDER = [
  { name: 'Trial Moderator', roleId: 'ROLE_ID_1', cost: 0 },
  { name: 'Moderator', roleId: 'ROLE_ID_2', cost: 50 },
  { name: 'Senior Moderator', roleId: 'ROLE_ID_3', cost: 150 },
  { name: 'Head Moderator', roleId: 'ROLE_ID_4', cost: 300 },
  { name: 'Trial Admin', roleId: 'ROLE_ID_5', cost: 500 },
  { name: 'Admin', roleId: 'ROLE_ID_6', cost: 750 },
  { name: 'Senior Admin', roleId: 'ROLE_ID_7', cost: 1050 },
  { name: 'Head Admin', roleId: 'ROLE_ID_8', cost: 1400 },
  { name: 'Assistant Server Manager', roleId: 'ROLE_ID_9', cost: 1700 },
  { name: 'Server Manager', roleId: 'ROLE_ID_10', cost: 2000 },
];
function getRankIndex(userId) {
  return data.ranks[userId] ?? 0;
}

// ---------- Warn durations (in weeks) ----------
const WARN_DURATIONS = { warn: 2, minorwarn: 1, majorwarn: 3 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) {
    message.reply('Mention someone to warn, e.g. `?warn @user`.');
    return;
  }
  if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    message.reply("You don't have permission to warn members.");
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
}

// ---------- Demotion ----------
async function demoteMember(member) {
  const currentIndex = getRankIndex(member.id);
  if (currentIndex <= 0) return null;

  const currentRank = RANK_LADDER[currentIndex];
  const lowerRank = RANK_LADDER[currentIndex - 1];

  try {
    await member.roles.remove(currentRank.roleId).catch(() => {});
    await member.roles.add(lowerRank.roleId).catch(() => {});
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

// ---------- Inactivity check ----------
async function checkInactivity(guild) {
  const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
  const now = Date.now();

  for (const userId of Object.keys(data.ranks)) {
    const rankIndex = getRankIndex(userId);
    if (rankIndex <= 0) continue;

    const last = data.lastActive[userId] || 0;
    if (now - last < INACTIVITY_THRESHOLD_MS) continue;

    data.inactivityWarns[userId] = (data.inactivityWarns[userId] || 0) + 1;
    const warnCount = data.inactivityWarns[userId];

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;

    if (warnCount >= MAX_INACTIVITY_WARNS) {
      const newRank = await demoteMember(member);
      data.inactivityWarns[userId] = 0;
      data.lastActive[userId] = now;
      saveData(data);

      const msg = newRank
        ? `⬇️ ${member} was demoted to **${newRank}** for inactivity (${MAX_INACTIVITY_WARNS} inactivity warnings, no response).`
        : `${member} hit max inactivity warnings but is already at the lowest rank.`;
      logChannel?.send(msg);
      member.send(msg).catch(() => {});
    } else {
      saveData(data);
      const msg = `⚠️ ${member}, you've been inactive for a while. This is inactivity warning **${warnCount}/${MAX_INACTIVITY_WARNS}** — any bot command or mod action resets this. Reach ${MAX_INACTIVITY_WARNS} and you'll be demoted.`;
      logChannel?.send(msg);
      member.send(msg).catch(() => {});
    }
  }
}

client.once('ready', () => {
  const guild = client.guilds.cache.first();
  if (guild) {
    setInterval(() => checkInactivity(guild), CHECK_INTERVAL_MS);
  }
});

// ---------- Main handler ----------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().split(/\s+/)[0];

  if (commands.includes(command)) {
    markActive(message.author.id);
  }

  if (command === 'help') {
    const list = [...commands].sort().join('\n  ');
    message.reply(
      '```\n' + 'No Category:\n' + `  ${list}\n\n` +
      `Type ${PREFIX}help command for more info on a command.\n` + '```'
    );
    return;
  }

  if (command === 'warn' || command === 'minorwarn' || command === 'majorwarn') {
    await applyWarn(message, command);
    return;
  }

  if (command === 'mute' || command === 'kick' || command === 'ban') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Mention someone, e.g. \`${PREFIX}${command} @user\`.`);
      return;
    }
    try {
      if (command === 'mute') await target.timeout(10 * 60 * 1000, `Muted by ${message.author.tag}`);
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

  if (command === 'settag') {
    const newTag = message.content.split(' ').slice(1).join(' ').trim();
    const target = message.mentions.members.first() || message.member;
    if (!newTag) {
      message.reply(`Usage: \`${PREFIX}settag <text>\``);
      return;
    }
    data.tags[target.id] = { text: newTag, manual: true };
    saveData(data);
    message.reply(`Tag for ${target} set to **${newTag}** (manual — won't auto-update anymore).`);
    return;
  }

  if (command === 'profile') {
    const target = message.mentions.members.first() || message.member;
    const credits = data.credits[target.id] || 0;
    const tag = data.tags[target.id]?.text || computeAutoTag(0);
    const rankIndex = getRankIndex(target.id);
    const rankName = RANK_LADDER[rankIndex].name;
    const warnCount = (data.warns[target.id] || []).length;
    const inactivityWarnCount = data.inactivityWarns[target.id] || 0;

    message.reply(
      `**${target.user.tag}'s Profile**\n` +
      `Rank: ${rankName}\n` +
      `Tag: ${tag}\n` +
      `Credits: ${credits}\n` +
      `Warns on record: ${warnCount}\n` +
      `Inactivity warnings: ${inactivityWarnCount}/${MAX_INACTIVITY_WARNS}`
    );
    return;
  }

  if (command === 'demote') {
    const target = message.mentions.members.first();
    if (!target) {
      message.reply(`Usage: \`${PREFIX}demote @user\``);
      return;
    }
    const newRank = await demoteMember(target);
    message.reply(newRank ? `${target} was demoted to **${newRank}**.` : `${target} could not be demoted (already at lowest rank, or role update failed).`);
    return;
  }

  if (command === 'rankup') {
    const userId = message.author.id;
    const currentIndex = getRankIndex(userId);
    const nextIndex = currentIndex + 1;

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

    try {
      const currentRole = RANK_LADDER[currentIndex];
      if (currentRole.roleId !== 'ROLE_ID_1') {
        await message.member.roles.remove(currentRole.roleId).catch(() => {});
      }
      await message.member.roles.add(nextRank.roleId);
    } catch {
      message.reply('Could not update roles — check the role IDs and bot permissions.');
      return;
    }

    data.credits[userId] = credits - nextRank.cost;
    data.ranks[userId] = nextIndex;
    updateTag(userId);
    saveData(data);

    message.reply(`🎉 You've been promoted to **${nextRank.name}**! Remaining credits: ${data.credits[userId]}.`);
    return;
  }

  if (command === 'trainingrp') {
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

        if (isClose) {
          score++;
          await message.channel.send(`✅ Correct-ish. ${item.rule}`);
        } else {
          await message.channel.send(`❌ Not quite. ${item.rule}`);
        }
      } catch {
        await message.channel.send(`⏱️ Time's up. ${item.rule}`);
      }
    }

    activeSessions.delete(message.author.id);
    const earned = score * CREDIT_REWARDS.correctAnswer;
    addCredits(message.author.id, earned);
    await message.channel.send(`🏁 Training complete! ${message.author} scored **${score}/${shuffledQuiz.length}** and earned **${earned} credits**.`);
    return;
  }
});

client.login(process.env.BOT_TOKEN);
