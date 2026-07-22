require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const PREFIX = '?';
const DATA_FILE = path.join(__dirname, './data.json'); // ✅ Safe path
const GUILD_ID = '1324059331406069872';
const PROFILE_CHANNEL_ID = '1528326521721196544';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const DAILY_REWARD = 5;

// ✅ Badge Icons (No Boosts Needed)
const BADGE_ICONS = {
  animated_badge: '🎇',
  vip_badge: '💎',
  legend_badge: '👑',
  veteran_badge: '🎖️',
  perfect_month: '🌟'
};

const RANK_LADDER = [
  { name: 'Trial Moderator', cost: 0 }, { name: 'Moderator', cost: 50 }, { name: 'Senior Moderator', cost: 150 },
  { name: 'Head Moderator', cost: 300 }, { name: 'Trial Admin', cost: 500 }, { name: 'Admin', cost: 750 },
  { name: 'Senior Admin', cost: 1050 }, { name: 'Head Admin', cost: 1400 }, { name: 'Assistant Server Manager', cost: 1700 },
  { name: 'Server Manager', cost: 2000 }
];
const RANK_NAMES = RANK_LADDER.map(r => r.name);
function getRankIndex(name) { return RANK_NAMES.indexOf(name); }

// ✅ EXACTLY 25 BEST ITEMS
const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', desc: 'Set your own profile tag', price: 100 },
  { id: 'color_role', name: 'Custom Color Role', desc: 'Unique colored name/role', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', desc: 'Exclusive VIP badge', price: 400, icon: BADGE_ICONS.vip_badge },
  { id: 'custom_embed', name: 'Custom Profile Layout', desc: 'Fancy styled profile', price: 600 },
  { id: 'glory_role', name: 'Glory Role', desc: 'Priority display role', price: 800 },
  { id: 'animated_badge', name: 'Animated Badge', desc: '🎇 Shows glowing icon in roster/profile!', price: 900, icon: BADGE_ICONS.animated_badge },
  { id: 'profile_background', name: 'Profile Background', desc: 'Unique background art', price: 500 },
  { id: 'signature', name: 'Custom Signature', desc: 'Sign mod logs/embeds', price: 200 },
  { id: 'rainbow_role', name: 'Rainbow Role', desc: 'Color-shifting name', price: 1200 },
  { id: 'double_daily', name: 'Double Daily', desc: '+10 credits daily forever', price: 300 },
  { id: 'skip_cooldown', name: 'No Cooldowns', desc: 'Use commands instantly', price: 500 },
  { id: 'extended_access', name: 'Extended Access', desc: 'View hidden mod channels', price: 650 },
  { id: 'silent_mode', name: 'Silent Mode', desc: 'Commands run quietly', price: 350 },
  { id: 'mention_exempt', name: 'Mention Immunity', desc: 'Cannot be pinged', price: 700 },
  { id: 'voice_priority', name: 'Voice Priority', desc: 'Speak first in VC', price: 400 },
  { id: 'senior_eligibility', name: 'Senior Mod Eligibility', desc: 'Unlock early promotion', price: 150 },
  { id: 'performance_boost', name: 'Performance Boost', desc: '2x faster to Excellent', price: 350 },
  { id: 'credit_booster', name: 'Credit Booster', desc: '+25% all credits earned', price: 600 },
  { id: 'inactivity_protect', name: 'Inactivity Shield', desc: 'Safe from demotion', price: 500 },
  { id: 'mod_mentor', name: 'Mentor Status', desc: 'Help new mods, special tag', price: 800 },
  { id: 'legend_badge', name: 'Legendary Badge', desc: 'Ultimate rare honor', price: 1000, icon: BADGE_ICONS.legend_badge },
  { id: 'veteran_badge', name: 'Veteran Badge', desc: 'Long service award', price: 750, icon: BADGE_ICONS.veteran_badge },
  { id: 'perfect_month', name: 'Perfect Month Award', desc: 'Zero-warn performance', price: 600, icon: BADGE_ICONS.perfect_month },
  { id: 'custom_emoji', name: 'Custom Emoji Slot', desc: 'Add your own emoji', price: 350 },
  { id: 'pet_buddy', name: 'Virtual Pet', desc: 'Pet shown on profile', price: 400 }
];

const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' }, { min: 100, tag: 'Reliable Moderator' }, { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' }, { min: 1500, tag: 'Legendary Moderator' }
];
const PERFECT_TAGS = { GOOD: 'Good', EXCELLENT: 'Excellent', BAD: 'Bad', VERGE: 'Verge of Demotion' };
const PERF_RULES = { excellent: { minCredits: 500, maxDaysInactive: 21 }, bad: { maxCredits: 100, minDaysInactive: 7 }, verge: { maxCredits: 50, minDaysInactive: 3, minWarns: 2 } };

// ✅ SAFE DATA LOAD — Never loses data!
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: [], performance: {}, lastDailyClaim: {}, inventory: {}
  };

  try {
    if (!fs.existsSync(DATA_FILE)) return defaultData;
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    // ✅ Merge old + new — keeps EVERYTHING!
    return {
      ...defaultData,
      ...d,
      config: { ...defaultData.config, ...d.config },
      credits: { ...defaultData.credits, ...d.credits },
      ranks: { ...defaultData.ranks, ...d.ranks },
      inventory: { ...defaultData.inventory, ...d.inventory },
      lastActive: { ...defaultData.lastActive, ...d.lastActive },
      performance: { ...defaultData.performance, ...d.performance }
    };
  } catch (e) {
    console.error('⚠️ Data load safe-fail:', e.message);
    return defaultData;
  }
}

// ✅ SAFE SAVE — Writes only after full backup
function saveData(d) {
  try {
    // Backup before overwrite
    if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
    fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
  } catch (e) {
    console.error('⚠️ Data save error:', e.message);
  }
}

// Load once safely
let data = loadData();

// ✅ UPDATED PRESETS: ID 144... → Senior Moderator + 250 Credits
const PRESET_RANKS = [
  { id: '1446192510593662976', rank: 'Senior Moderator', credits: 250 }, // ✅ CHANGED
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
PRESET_RANKS.forEach(u => {
  // Only set if missing — NO OVERWRITE of existing data!
  if (data.ranks[u.id] === undefined) data.ranks[u.id] = getRankIndex(u.rank);
  if (data.credits[u.id] === undefined) data.credits[u.id] = u.credits ?? (u.rank === 'Server Manager' ? 9999 : 0);
  if (!data.performance[u.id]) data.performance[u.id] = { tag: PERFECT_TAGS.GOOD };
  if (!data.inventory[u.id]) data.inventory[u.id] = [];
  if (!data.tags[u.id]) data.tags[u.id] = { text: getFullTag(u.id), manual: false };
});
saveData(data);

function getLogChannel(g) { return g.channels.cache.get(data.config.logChannelId); }
function findRole(g, name) { return g.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase()); }
function isModerator(id) { return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { return data.ranks[id] === getRankIndex('Server Manager'); }

function getBaseTag(credits = 0) { let base = TAG_THRESHOLDS[0].tag; TAG_THRESHOLDS.forEach(r => { if (credits >= r.min) base = r.tag; }); return base; }
function getPerfTag(id) {
  const credits = data.credits[id] || 0; const daysInactive = (Date.now() - (data.lastActive[id] || 0)) / 86400000; const warns = (data.warns[id] || []).length;
  if (credits >= PERF_RULES.excellent.minCredits && daysInactive <= PERF_RULES.excellent.maxDaysInactive) return PERFECT_TAGS.EXCELLENT;
  if (credits <= PERF_RULES.verge.maxCredits && daysInactive >= PERF_RULES.verge.minDaysInactive && warns >= PERF_RULES.verge.minWarns) return PERFECT_TAGS.VERGE;
  if (credits <= PERF_RULES.bad.maxCredits && daysInactive >= PERF_RULES.bad.minDaysInactive) return PERFECT_TAGS.BAD;
  return data.performance[id]?.tag || PERFECT_TAGS.GOOD;
}

// ✅ SHOW BADGES NEXT TO NAME IN ROSTER!
function getUserDisplay(userId, name) {
  const badges = [];
  const inv = data.inventory[userId] || [];
  inv.forEach(item => {
    const shopItem = SHOP.find(i => i.id === item.id);
    if (shopItem?.icon) badges.push(shopItem.icon);
  });
  return `${name} — ${getFullTag(userId)} ${badges.join(' ')}`;
}

function getFullTag(id) { return `${getBaseTag(data.credits[id]||0)} | ${getPerfTag(id)}`; }
function refreshTag(id) { if (!data.tags[id]?.manual) data.tags[id] = { text: getFullTag(id), manual: false }; saveData(data); }
function addCredits(id, amt) { amt = Math.max(0, Number(amt) || 0); data.credits[id] = Math.max(0, (data.credits[id] || 0) + amt); data.dailyCredits[id] += amt; refreshTag(id); saveData(data); }
function markActive(id) { data.lastActive[id] = Date.now(); data.inactivityWarns[id] = 0; refreshTag(id); }

async function setMemberRank(guild, member, rankName) {
  const newIdx = getRankIndex(rankName); if (newIdx === -1) return null;
  const oldIdx = data.ranks[member.id] ?? -1; if (oldIdx >= 0) { const oldRole = findRole(guild, RANK_NAMES[oldIdx]); if (oldRole) await member.roles.remove(oldRole).catch(() => {}); }
  const newRole = findRole(guild, rankName); if (newRole) await member.roles.add(newRole).catch(() => {});
  data.ranks[member.id] = newIdx; data.performance[member.id] ??= { tag: PERFECT_TAGS.GOOD }; refreshTag(member.id); saveData(data);
  return { old: RANK_NAMES[oldIdx] || 'None', new: rankName };
}

client.once('ready', () => console.log('✅ Ready — All Fixed!'));

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // ✅ HELP MENU
  if (cmd === 'help') return msg.reply(`\`\`\`
Prefix: ${PREFIX}
Commands:
?addcredits    - Give credits
?removecredits - Take credits
?claim         - Daily +${DAILY_REWARD}
?shop          - 🛒 Shop (Animated Badge = 🎇!)
?buy <id>      - Buy item
?profile       - View profile with badges
?rankup        - Rank up
?rankmod       - Make Trial Mod
?roster        - Full list with badges ✨
?setrank       - [Server Manager] Set rank
?settag        - Custom tag
?setup         - Admin config

Moderation:
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
    const target = msg.mentions.members.first(); const amount = parseInt(args[1]);
    if (!target || isNaN(amount) || amount <= 0) return msg.reply(`✅ Usage: ${PREFIX}addcredits @User 1000`);
    addCredits(target.id, amount);
    return msg.reply(`✅ Gave **${amount}** credits to **${target.user.tag}**\nBalance: **${data.credits[target.id]}**`);
  }

  if (cmd === 'removecredits') {
    const target = msg.mentions.members.first(); const amount = parseInt(args[1]);
    if (!target || isNaN(amount) || amount <= 0) return msg.reply(`Usage: ${PREFIX}removecredits @User 50`);
    addCredits(target.id, -amount);
    return msg.reply(`✅ Took **${amount}** from **${target.user.tag}**\nBalance: **${data.credits[target.id]}**`);
  }

  // ✅ SHOP — SHOWS ICONS
  if (cmd === 'shop') {
    const embed = new EmbedBuilder()
      .setTitle('🛒 Credit Shop')
      .setColor(0xFFD700)
      .setDescription(`Use \`${PREFIX}buy <item-id>\` to purchase!`);
    
    SHOP.forEach(item => {
      embed.addFields({
        name: `${item.icon || ''} ${item.name} [${item.id}] — ${item.price} Credits`,
        value: item.desc
      });
    });

    return msg.reply({ embeds: [embed] });
  }

  // ✅ BUY — SAVES BADGE
  if (cmd === 'buy') {
    const itemId = args[0]?.toLowerCase();
    const item = SHOP.find(i => i.id === itemId);
    if (!item) return msg.reply(`❌ Invalid item! Use \`?shop\` to see all items.`);
    
    const balance = data.credits[msg.author.id] || 0;
    if (balance < item.price) return msg.reply(`❌ Not enough credits! Need **${item.price}**, you have **${balance}**.`);
    
    addCredits(msg.author.id, -item.price);
    if (!data.inventory[msg.author.id]) data.inventory[msg.author.id] = [];
    data.inventory[msg.author.id].push(item);
    saveData(data);
    
    return msg.reply(`✅ Success! Bought **${item.icon || ''} ${item.name}** for **${item.price}** credits!\nNow visible in ?roster & ?profile!`);
  }

  // ✅ ROSTER — SHOWS BADGES NEXT TO NAMES 🎇
  if (cmd === 'roster') {
    const grouped = {}; RANK_NAMES.forEach(r => grouped[r] = []);
    for (const [userId] of Object.entries(data.ranks)) {
      const rankIdx = data.ranks[userId]; const rankName = RANK_NAMES[rankIdx];
      const member = await msg.guild.members.fetch(userId).catch(() => null); if (!member) continue;
      grouped[rankName].push(getUserDisplay(userId, member.user.tag));
    }
    const embed = new EmbedBuilder().setTitle('📋 Full Moderation Roster').setColor(0x2ECC71);
    [...RANK_NAMES].reverse().forEach(r => { if (grouped[r].length) embed.addFields({ name: r, value: grouped[r].join('\n') }); });
    return msg.reply({ embeds: [embed] });
  }

  if (cmd === 'setrank' && isServerManager(msg.author.id)) {
    const target = msg.mentions.members.first(); const rankName = args.slice(1).join(' ');
    if (!target || !RANK_NAMES.includes(rankName)) return msg.reply(`Usage: ${PREFIX}setrank @User RankName`);
    const res = await setMemberRank(msg.guild, target, rankName);
    return msg.reply(`✅ ${target}: ${res.old} → ${res.new}`);
  }

  // ✅ PROFILE — SHOWS BADGES WITH ICONS
  if (cmd === 'profile') {
    const target = msg.mentions.members.first() || msg.member;
    const inv = data.inventory[target.id]?.map(i => {
      const item = SHOP.find(s => s.id === i.id);
      return `${item?.icon || ''} ${item?.name || i.name}`;
    }).join(', ') || 'None';
    
    const embed = new EmbedBuilder().setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        { name: 'Rank', value: RANK_NAMES[data.ranks[target.id]??-1]||'—', inline: true },
        { name: 'Credits', value: `${data.credits[target.id]||0}`, inline: true },
        { name: 'Status', value: getPerfTag(target.id), inline: true },
        { name: '🎒 Inventory', value: inv }
      ).setColor(0x5865F2);
    return msg.reply({ embeds: [embed] });
  }

  if (['break','unbreak','warn','mute','kick','ban','feedback','rankmod','settag','setup','demote','minorwarn','majorwarn'].includes(cmd)) markActive(msg.author.id);
});

client.login(process.env.BOT_TOKEN);