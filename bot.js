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
const DATA_FILE = './data.json';
const GUILD_ID = '1324059331406069872';
const MOD_OF_THE_DAY_CHANNEL_ID = '1528326035605819402';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const MAX_INACTIVITY_WARNS = 3;
const MOD_OF_DAY_BONUS = 50;

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      credits: {}, warns: {}, tags: {}, ranks: {},
      lastActive: {}, inactivityWarns: {}, config: {},
      dailyCredits: {}, pfps: {},
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {};
  parsed.inactivityWarns ??= {};
  parsed.config ??= {};
  parsed.dailyCredits ??= {};
  parsed.pfps ??= {};
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

// ---------- Commands list ----------
const commands = [
  'ban', 'createtag', 'demote', 'feedback', 'kick', 'majorwarn',
  'minorwarn', 'modoftheday', 'mute', 'profile', 'rankup', 'roster',
  'setpfp', 'settag', 'setup', 'trainingrp', 'warn',
];

// ---------- Credit rewards ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };

function addCredits(userId, amount) {
  data.credits[userId] = (data.credits[userId] || 0) + amount;
  data.dailyCredits[userId] = (data.dailyCredits[userId] || 0) + amount;
  updateTag(userId);
  saveData(data);
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
function getRankIndex(userId) {
  return data.ranks[userId] ?? 0;
}
function findRoleByName(guild, name) {
  return guild.roles.cache.find((r) => r.name === name) || null;
}

// ---------- Warn durations (in weeks) ----------
const WARN_DURATIONS = { warn: 2, minorwarn: 1, majorwarn: 3 };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) {
    message.reply(`Mention someone to warn, e.g. \`${PREFIX}${type} @user\`.`);
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

// ---------- Inactivity check ----------
async function checkInactivity(guild) {
  const logChannel = getLogChannel(guild);
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
      const msg = `⚠️ ${member}, inactivity warning **${warnCount}/${MAX_INACTIVITY_WARNS}** — any command or mod action resets this.`;
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

client.once('ready', () => {
  const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
  if (guild) {
    setInterval(() => checkInactivity(guild), CHECK_INTERVAL_MS);
    setInterval(() => pickModeratorOfTheDay(guild), CHECK_INTERVAL_MS);
  }
});

// ---------- Main handler ----------
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift();

  if (commands.includes(command)) markActive(message.author.id);

  if (command === 'help') {
    const list = [...commands].sort().join('\n  ');
    message.reply(
      '```\n' + 'No Category:\n' + `  ${list}\n\n` +
      `Type ${PREFIX}help command for more info on a command.\n` + '```'
    );
    return;
  }

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
      message.reply(`✅ Logging (warns, demotions, tag updates) will now post in ${channel}.`);
      return;
    }
    message.reply(`Usage: \`${PREFIX}setup logchannel #channel\``);
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
    const newTag = args.join(' ').trim();
    const target = message.mentions.members.first() || message.member;
    if (!newTag) {
      message.reply(`Usage: \`${PREFIX}settag <text>\``);
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
    const rankName = RANK_LADDER[rankIndex].name;
    const warnCount = (data.warns[target.id] || []).length;
    const inactivityWarnCount = data.inactivityWarns[target.id] || 0;
    const pfp = data.pfps[target.id];

    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        { name: 'Rank', value: rankName, inline: true },
        { name: 'Tag', value: tag, inline: true },
        { name: 'Credits', value: `${credits}`, inline: true },
        { name: 'Warns on record', value: `${warnCount}`, inline: true },
        { name: 'Inactivity warnings', value: `${inactivityWarnCount}/${MAX_INACTIVITY_WARNS}`, inline: true },
      )
      .setColor(0x5865f2);
    if (pfp) embed.setImage(pfp);
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
      grouped[rankName].push(`${member.user.tag} — *${tag}*`);
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
    getLogChannel(message.guild)?.send(newRank ? `⬇️ ${target} was demoted to **${newRank}** by ${message.author}.` : null);
    return;
  }

  if (command === 'rankup') {
    const userId = message.author.id;
    const guild = message.guild;
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
