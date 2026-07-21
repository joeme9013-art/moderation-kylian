require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
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
const DATA_FILE = './data.json';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day
const MAX_INACTIVITY_WARNS = 3;

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      credits: {}, warns: {}, tags: {}, ranks: {},
      lastActive: {}, inactivityWarns: {}, config: {},
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {};
  parsed.inactivityWarns ??= {};
  parsed.config ??= {};
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

// ---------- Credit rewards ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };

function addCredits(userId, amount) {
  data.credits[userId] = (data.credits[userId] || 0) + amount;
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

// ---------- Rank ladder ----------
// roleName must match the exact role name in your server (case-sensitive).
// No IDs needed —
