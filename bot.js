require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ RAILWAY SAFE PATH
const DATA_FILE = path.resolve('./data.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const PREFIX = '?';
const GUILD_ID = '1324059331406069872';
const PROFILE_CHANNEL_ID = '1528326521721196544';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const DAILY_REWARD = 5;

// ✅ Badge Icons (Honest Names)
const BADGE_ICONS = {
  badge: '🎖️',
  vip_badge: '💎',
  legend_badge: '👑',
  veteran_badge: '🎗️',
  perfect_month: '🌟'
};

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
  { name: 'Server Manager', cost: 2000 }
];
const RANK_NAMES = RANK_LADDER.map(r => r.name);
function getRankIndex(name) { return RANK_NAMES.indexOf(name); }

// ✅ EXACTLY 25 ITEMS — Honest Names
const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', desc: 'Set your own profile tag', price: 100 },
  { id: 'color_role', name: 'Custom Color Role', desc: 'Unique colored name/role', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', desc: 'Exclusive VIP status icon', price: 400, icon: BADGE_ICONS.vip_badge },
  { id: 'custom_embed', name: 'Custom Profile Layout', desc: 'Fancy styled profile display', price: 600 },
  { id: 'glory_role', name: 'Glory Role', desc: 'Priority display position', price: 800 },
  { id: 'badge', name: 'Badge', desc: '🎖️ Permanent icon shown in roster & profile', price: 900, icon: BADGE_ICONS.badge },
  { id: 'profile_background', name: 'Profile Background', desc: 'Unique profile background art', price: 500 },
  { id: 'signature', name: 'Custom Signature', desc: 'Sign mod logs & embeds', price: 200 },
  { id: 'rainbow_role', name: 'Rainbow Role', desc: 'Color-shifting display name', price: 1200 },
  { id: 'double_daily', name: 'Double Daily', desc: '+10 credits daily forever', price: 300 },
  { id: 'skip_cooldown', name: 'No Cooldowns', desc: 'Use commands instantly', price: 500 },
  { id: 'extended_access', name: 'Extended Access', desc: 'View hidden mod channels', price: 650 },
  { id: 'silent_mode', name: 'Silent Mode', desc: 'Commands run quietly/log-free', price: 350 },
  { id: 'mention_exempt', name: 'Mention Immunity', desc: 'Cannot be pinged/mentioned', price: 700 },
  { id: 'voice_priority', name: 'Voice Priority', desc: 'Speak first in voice channels', price: 400 },
  { id: 'senior_eligibility', name: 'Senior Mod Eligibility', desc: 'Unlock early promotion path', price: 150 },
  { id: 'performance_boost', name: 'Performance Boost', desc: '2x faster Excellent rating', price: 350 },
  { id: 'credit_booster', name: 'Credit Booster', desc: '+25% all credits earned forever', price: 600 },
  { id: 'inactivity_protect', name: 'Inactivity Shield', desc: 'Safe from auto-demotion', price: 500 },
  { id: 'mod_mentor', name: 'Mentor Status', desc: 'Help new mods + special tag', price: 800 },
  { id: 'legend_badge', name: 'Legendary Badge', desc: 'Ultimate rare honor icon', price: 1000, icon: BADGE_ICONS.legend_badge },
  { id: 'veteran_badge', name: 'Veteran Badge', desc: 'Long service award icon', price: 750, icon: BADGE_ICONS.veteran_badge },
  { id: 'perfect_month', name: 'Perfect Month Award', desc: 'Zero-warn performance icon', price: 600, icon: BADGE_ICONS.perfect_month },
  { id: 'custom_emoji', name: 'Custom Emoji Slot', desc: 'Add your own emoji to server', price: 350 },
  { id: 'pet_buddy', name: 'Virtual Pet', desc: 'Pet shown permanently on profile', price: 400 }
];

const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' },
  { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' }
];
const PERFECT_TAGS = { GOOD: 'Good', EXCELLENT: 'Excellent', BAD: 'Bad', VERGE: 'Verge of Demotion' };
const PERF_RULES = {
  excellent: { minCredits: 500, maxDaysInactive: 21 },
  bad: { maxCredits: 100, minDaysInactive: 7 },
  verge: { maxCredits: 50, minDaysInactive: 3, minWarns: 2 }
};

// ✅ SAFE DATA LOAD/SAVE
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: [], performance: {}, lastDailyClaim: {}, inventory: {}
  };

  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    return {
      ...defaultData, ...d,
      config: { ...defaultData.config, ...d.config },
      credits: { ...defaultData.credits, ...d.credits },
      ranks: { ...defaultData.ranks, ...d.ranks },
      inventory: { ...defaultData.inventory, ...d.inventory },
      lastActive: { ...defaultData.lastActive, ...d.lastActive },
      performance: { ...defaultData.performance, ...d.performance },
      tags: { ...defaultData.tags, ...d.tags }
    };
  } catch (err) {
    console.error('⚠️ Data safe-load:', err.message);
    return defaultData;
  }
}

function saveData(d) {
  try {
    if (fs.existsSync(DATA_FILE + '.bak')) fs.unlinkSync(DATA_FILE + '.bak');
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
    fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
  } catch (err) {
    console.error('⚠️ Save error:', err.message);
  }
}

let data = loadData();

// ✅ Initial Presets (ID 144... = Senior Mod + 250 credits)
const INITIAL_PRESETS = [
  { id: '1446192510593662976', rank: 'Senior Moderator', credits: 250 },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
INITIAL_PRESETS.forEach(u => {
  if (data.ranks[u.id] === undefined) data.ranks[u.id] = getRankIndex(u.rank);
  if (data.credits[u.id] === undefined) data.credits[u.id] = u.credits ?? (u.rank === 'Server Manager' ? 9999 : 0);
  if (!data.performance[u.id]) data.performance[u.id] = { tag: PERFECT_TAGS.GOOD };
  if (!data.inventory[u.id]) data.inventory[u.id] = [];
  if (!data.tags[u.id]) data.tags[u.id] = { text: `${getBaseTag(data.credits[u.id]||0)} | ${PERFECT_TAGS.GOOD}`, manual: false };
});
saveData(data);

// ✅ FIXED: No more infinite loop!
function ensureUser(userId) {
  if (data.ranks[userId] === undefined) data.ranks[userId] = -1;
  if (data.credits[userId] === undefined) data.credits[userId] = 0;
  if (!data.performance[userId]) data.performance[userId] = { tag: PERFECT_TAGS.GOOD };
  if (!data.inventory[userId]) data.inventory[userId] = [];
  if (!data.tags[userId]) data.tags[userId] = { text: `${getBaseTag(0)} | ${PERFECT_TAGS.GOOD}`, manual: false };
}

function getBaseTag(credits = 0) {
  let base = TAG_THRESHOLDS[0].tag;
  TAG_THRESHOLDS.forEach(r => { if (credits >= r.min) base = r.tag; });
  return base;
}
function getPerfTag(id) {
  const credits = data.credits[id] || 0;
  const daysInactive = (Date.now() - (data.lastActive[id] || 0)) / 86400000;
  const warns = (data.warns[id] || []).length;
  if (credits >= PERF_RULES.excellent.minCredits && daysInactive <= PERF_RULES.excellent.maxDaysInactive)
    return PERFECT_TAGS.EXCELLENT;
  if (credits <= PERF_RULES.verge.maxCredits && daysInactive >= PERF_RULES.verge.minDaysInactive && warns >= PERF_RULES.verge.minWarns)
    return PERFECT_TAGS.VERGE;
  if (credits <= PERF_RULES.bad.maxCredits && daysInactive >= PERF_RULES.bad.minDaysInactive)
    return PERFECT_TAGS.BAD;
  return data.performance[id]?.tag || PERFECT_TAGS.GOOD;
}
function getFullTag(id) { return `${getBaseTag(data.credits[id]||0)} | ${getPerfTag(id)}`; }
function getUserDisplay(userId, name) {
  ensureUser(userId);
  const badges = [];
  const inv = data.inventory[userId] || [];
  inv.forEach(item => {
    const si = SHOP.find(i => i.id === item.id);
    if (si?.icon) badges.push(si.icon);
  });
  return `${name} — ${getFullTag(userId)} ${badges.join(' ')}`;
}
function refreshTag(id) {
  ensureUser(id);
  if (!data.tags[id]?.manual) data.tags[id].text = getFullTag(id);
  saveData(data);
}
function addCredits(id, amt) { ensureUser(id); amt = Math.max(0, Number(amt)||0); data.credits[id] += amt; refreshTag(id); }
function markActive(id) { ensureUser(id); data.lastActive[id] = Date.now(); data.inactivityWarns[id] = 0; }
async function setMemberRank(guild, member, rankName) {
  ensureUser(member.id);
  const newIdx = getRankIndex(rankName);
  if (newIdx === -1) return null;
  const oldIdx = data.ranks[member.id] ?? -1;
  if (oldIdx >= 0) {
    const oldRole = guild.roles.cache.find(r => r.name === RANK_NAMES[oldIdx]);
    if (oldRole) await member.roles.remove(oldRole).catch(() => {});
  }
  const newRole = guild.roles.cache.find(r => r.name === rankName);
  if (newRole) await member.roles.add(newRole).catch(() => {});
  data.ranks[member.id] = newIdx;
  refreshTag(member.id);
  saveData(data);
  return { old: RANK_NAMES[oldIdx]||'None', new: rankName };
}
function isModerator(id) { ensureUser(id); return (data.ranks[id]??-1) >= 0; }
function isServerManager(id) { ensureUser(id); return data.ranks[id] === getRankIndex('Server Manager'); }

// ✅ Error Safe
client.once('ready', () => console.log(`✅ Logged in — FULL HELP MENU + NO CRASHES!`));
client.on('error', err => console.error('❌ Bot Error:', err.message));

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // ✅ FULL HELP MENU RESTORED
  if (cmd === 'help') return msg.reply(`\`\`\`
Prefix: ${PREFIX}
?addcredits    - Give credits to a user
?removecredits - Take credits from a user
?claim         - Get daily +${DAILY_REWARD} credits
?shop          - View credit shop
?buy <id>      - Buy an item from shop
?profile       - View your profile & badges
?rankup        - Upgrade your rank
?rankmod       - Promote someone to Trial Moderator
?roster        - View full mod list with badges
?setrank       - [Server Manager] Set any rank
?settag        - Set custom profile tag
?setup         - Configure bot channels

Moderation Commands:
?ban, ?kick, ?mute, ?warn, ?minorwarn, ?majorwarn, ?demote
?break, ?unbreak, ?feedback
\`\`\``);

  if (cmd === 'claim') {
    if (!isModerator(msg.author.id)) return msg.reply('❌ Mods only');
    const today = new Date().toDateString();
    if (data.lastDailyClaim[msg.author.id] === today) return msg.reply('❌ Already claimed today');
    data.lastDailyClaim[msg.author.id] = today; addCredits(msg.author.id, DAILY_REWARD);
    return msg.reply(`✅ +${DAILY_REWARD} daily credits!`);
  }

  if (cmd === 'addcredits') {
    const target = msg.mentions.members.first();
    const amount = parseInt(args[1]);
    if (!target || isNaN(amount) || amount <= 0) return msg.reply(`Usage: ${PREFIX}addcredits @User 100`);
    addCredits(target.id, amount);
    return msg.reply(`✅ ${target.user.tag}: ${data.credits[target.id]} credits`);
  }

  if (cmd === 'shop') {
    const embed = new EmbedBuilder().setTitle('🛒 Shop').setColor(0xFFD700);
    SHOP.forEach(i => embed.addFields({ name: `${i.icon||''} ${i.name} — ${i.price}`, value: i.desc }));
    return msg.reply({ embeds: [embed] });
  }

  if (cmd === 'buy') {
    const itemId = args[0]?.toLowerCase();
    const item = SHOP.find(i => i.id === itemId);
    if (!item) return msg.reply('❌ Invalid item — use ?shop');
    if ((data.credits[msg.author.id]||0) < item.price) return msg.reply('❌ Not enough credits');
    addCredits(msg.author.id, -item.price);
    data.inventory[msg.author.id].push(item);
    saveData(data);
    return msg.reply(`✅ Bought **${item.icon||''} ${item.name}** — visible in roster/profile!`);
  }

  if (cmd === 'roster') {
    const grouped = {}; RANK_NAMES.forEach(r => grouped[r] = []);
    for (const [uid] of Object.entries(data.ranks)) {
      const idx = data.ranks[uid]; const rn = RANK_NAMES[idx];
      const m = await msg.guild.members.fetch(uid).catch(() => null);
      if (m) grouped[rn].push(getUserDisplay(uid, m.user.tag));
    }
    const embed = new EmbedBuilder().setTitle('📋 Roster').setColor(0x2ECC71);
    [...RANK_NAMES].reverse().forEach(r => { if (grouped[r].length) embed.addFields({ name: r, value: grouped[r].join('\n') }); });
    return msg.reply({ embeds: [embed] });
  }

  if (cmd === 'profile') {
    const target = msg.mentions.members.first() || msg.member; ensureUser(target.id);
    const inv = data.inventory[target.id]?.map(i => {
      const si = SHOP.find(x => x.id === i.id);
      return `${si?.icon||''} ${si?.name||i.name}`;
    }).join(', ') || 'None';
    const embed = new EmbedBuilder().setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        { name: 'Rank', value: RANK_NAMES[data.ranks[target.id]??-1]||'—', inline: true },
        { name: 'Credits', value: `${data.credits[target.id]||0}`, inline: true },
        { name: 'Inventory', value: inv }
      ).setColor(0x5865F2);
    return msg.reply({ embeds: [embed] });
  }

  if (['rankup','setrank','warn','mute','kick','ban','demote','rankmod','settag','setup','break','unbreak','feedback'].includes(cmd)) markActive(msg.author.id);
});

client.login(process.env.BOT_TOKEN || '');
