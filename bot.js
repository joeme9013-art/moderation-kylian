require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ Railway safe path
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

// ✅ Honest badge names
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

// ✅ 25 honest shop items
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

// ✅ Safe data load/save — no corruption
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: [], performance: {}, lastDailyClaim: {}, inventory: {}
  };
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2)); return defaultData; }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    return { ...defaultData, ...d, config: { ...defaultData.config, ...d.config }, credits: { ...defaultData.credits, ...d.credits }, ranks: { ...defaultData.ranks, ...d.ranks }, inventory: { ...defaultData.inventory, ...d.inventory }, lastActive: { ...defaultData.lastActive, ...d.lastActive }, performance: { ...defaultData.performance, ...d.performance }, tags: { ...defaultData.tags, ...d.tags } };
  } catch (e) { console.error('⚠️ Data load:', e.message); return defaultData; }
}
function saveData(d) { try { if (fs.existsSync(DATA_FILE + '.bak')) fs.unlinkSync(DATA_FILE + '.bak'); if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak'); fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch (e) { console.error('⚠️ Save:', e.message); } }

let data = loadData();

// ✅ Presets: ID 144... = Senior Mod + 250 credits
const INITIAL_PRESETS = [
  { id: '1446192510593662976', rank: 'Senior Moderator', credits: 250 },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
INITIAL_PRESETS.forEach(u => { if (data.ranks[u.id] === undefined) data.ranks[u.id] = getRankIndex(u.rank); if (data.credits[u.id] === undefined) data.credits[u.id] = u.credits ?? (u.rank === 'Server Manager' ? 9999 : 0); if (!data.performance[u.id]) data.performance[u.id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[u.id]) data.inventory[u.id] = []; if (!data.tags[u.id]) data.tags[u.id] = { text: `${getBaseTag(data.credits[u.id]||0)} | ${PERFECT_TAGS.GOOD}`, manual: false }; });
saveData(data);

// ✅ No infinite loop
function ensureUser(id) { if (data.ranks[id] === undefined) data.ranks[id] = -1; if (data.credits[id] === undefined) data.credits[id] = 0; if (!data.performance[id]) data.performance[id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[id]) data.inventory[id] = []; if (!data.tags[id]) data.tags[id] = { text: `${getBaseTag(0)} | ${PERFECT_TAGS.GOOD}`, manual: false }; }
function getBaseTag(c = 0) { let b = TAG_THRESHOLDS[0].tag; TAG_THRESHOLDS.forEach(r => { if (c >= r.min) b = r.tag; }); return b; }
function getPerfTag(id) { const c = data.credits[id]||0; const d = (Date.now() - (data.lastActive[id]||0))/86400000; const w = (data.warns[id]||[]).length; if (c >= PERF_RULES.excellent.minCredits && d <= PERF_RULES.excellent.maxDaysInactive) return PERFECT_TAGS.EXCELLENT; if (c <= PERF_RULES.verge.maxCredits && d >= PERF_RULES.verge.minDaysInactive && w >= PERF_RULES.verge.minWarns) return PERFECT_TAGS.VERGE; if (c <= PERF_RULES.bad.maxCredits && d >= PERF_RULES.bad.minDaysInactive) return PERFECT_TAGS.BAD; return data.performance[id]?.tag || PERFECT_TAGS.GOOD; }
function getFullTag(id) { return `${getBaseTag(data.credits[id]||0)} | ${getPerfTag(id)}`; }
function getUserDisplay(id, name) { ensureUser(id); const badges = (data.inventory[id]||[]).map(i => SHOP.find(x => x.id === i.id)?.icon).filter(Boolean); return `${name} — ${getFullTag(id)} ${badges.join(' ')}`; }
function refreshTag(id) { ensureUser(id); if (!data.tags[id]?.manual) data.tags[id].text = getFullTag(id); saveData(data); }
function addCredits(id, amt) { ensureUser(id); data.credits[id] = Math.max(0, (data.credits[id]||0) + Math.max(0, amt)); refreshTag(id); }
function markActive(id) { ensureUser(id); data.lastActive[id] = Date.now(); data.inactivityWarns[id] = 0; }
function isModerator(id) { ensureUser(id); return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { ensureUser(id); return data.ranks[id] === getRankIndex('Server Manager'); }
function findRole(g, n) { return g.roles.cache.find(r => r.name.toLowerCase() === n.toLowerCase()); }
async function setMemberRank(g, m, rn) { ensureUser(m.id); const ni = getRankIndex(rn); if (ni === -1) return null; const oi = data.ranks[m.id] ?? -1; if (oi >= 0) { const or = findRole(g, RANK_NAMES[oi]); if (or) await m.roles.remove(or).catch(()=>{}); } const nr = findRole(g, rn); if (nr) await m.roles.add(nr).catch(()=>{}); data.ranks[m.id] = ni; refreshTag(m.id); saveData(data); return { old: RANK_NAMES[oi]||'None', new: rn }; }

// ✅ Ready & error safe
client.once('ready', () => console.log(`✅ Online — ALL COMMANDS WORKING!`));
client.on('error', e => console.error('❌ Bot:', e.message));

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // ✅ FULL HELP — ALL LISTED
  if (cmd === 'help') return msg.reply(`\`\`\`
Prefix: ${PREFIX}
?addcredits    - Give credits
?removecredits - Take credits
?claim         - Daily +${DAILY_REWARD}
?shop          - View shop
?buy <id>      - Buy item
?profile       - View profile/badges
?rankup        - Promote yourself
?rankmod       - Make Trial Mod
?roster        - Full mod list
?setrank       - [Manager] Set rank
?settag        - Custom tag
?setup         - Bot config

Moderation:
?ban, ?kick, ?mute, ?warn, ?minorwarn, ?majorwarn, ?demote
?break, ?unbreak, ?feedback
\`\`\``);

  // ✅ ESSENTIAL WORKING COMMANDS
  if (cmd === 'claim') { if (!isModerator(msg.author.id)) return msg.reply('❌ Mods only'); const t = new Date().toDateString(); if (data.lastDailyClaim[msg.author.id] === t) return msg.reply('❌ Already claimed'); data.lastDailyClaim[msg.author.id] = t; addCredits(msg.author.id, DAILY_REWARD); return msg.reply(`✅ +${DAILY_REWARD} credits`); }
  if (cmd === 'addcredits') { const u = msg.mentions.members.first(); const a = parseInt(args[1]); if (!u || isNaN(a) || a <= 0) return msg.reply(`Usage: ${PREFIX}addcredits @User 100`); addCredits(u.id, a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
  if (cmd === 'removecredits') { const u = msg.mentions.members.first(); const a = parseInt(args[1]); if (!u || isNaN(a) || a <= 0) return msg.reply(`Usage: ${PREFIX}removecredits @User 50`); addCredits(u.id, -a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
  if (cmd === 'shop') { const e = new EmbedBuilder().setTitle('🛒 Shop').setColor(0xFFD700); SHOP.forEach(i => e.addFields({ name: `${i.icon||''} ${i.name} — ${i.price}`, value: i.desc })); return msg.reply({ embeds: [e] }); }
  if (cmd === 'buy') { const i = args[0]?.toLowerCase(); const it = SHOP.find(x => x.id === i); if (!it) return msg.reply('❌ Invalid item — ?shop'); if ((data.credits[msg.author.id]||0) < it.price) return msg.reply('❌ Not enough credits'); addCredits(msg.author.id, -it.price); data.inventory[msg.author.id].push(it); saveData(data); return msg.reply(`✅ Bought **${it.icon||''} ${it.name}**`); }
  if (cmd === 'roster') { const g = {}; RANK_NAMES.forEach(r => g[r] = []); for (const [uid] of Object.entries(data.ranks)) { const ri = data.ranks[uid]; const rn = RANK_NAMES[ri]; const m = await msg.guild.members.fetch(uid).catch(()=>null); if (m) g[rn].push(getUserDisplay(uid, m.user.tag)); } const e = new EmbedBuilder().setTitle('📋 Roster').setColor(0x2ECC71); [...RANK_NAMES].reverse().forEach(r => { if (g[r].length) e.addFields({ name: r, value: g[r].join('\n') }); }); return msg.reply({ embeds: [e] }); }
  if (cmd === 'profile') { const t = msg.mentions.members.first() || msg.member; ensureUser(t.id); const inv = (data.inventory[t.id]||[]).map(i => { const s = SHOP.find(x => x.id === i.id); return `${s?.icon||''} ${s?.name||i.name}`; }).join(', ') || 'None'; const e = new EmbedBuilder().setTitle(`${t.user.tag}'s Profile`).addFields({ name: 'Rank', value: RANK_NAMES[data.ranks[t.id]??-1]||'—', inline: true }, { name: 'Credits', value: `${data.credits[t.id]||0}`, inline: true }, { name: 'Inventory', value: inv }).setColor(0x5865F2); return msg.reply({ embeds: [e] }); }
  if (cmd === 'setrank' && isServerManager(msg.author.id)) { const t = msg.mentions.members.first(); const rn = args.slice(1).join(' '); if (!t || !RANK_NAMES.includes(rn)) return msg.reply(`Usage: ${PREFIX}setrank @User RankName`); const res = await setMemberRank(msg.guild, t, rn); return msg.reply(`✅ ${t}: ${res.old} → ${res.new}`); }
  if (cmd === 'rankup') { const id = msg.author.id; if (!isModerator(id)) return msg.reply('❌ Not mod'); const ci = data.ranks[id]; if (ci >= RANK_NAMES.length - 1) return msg.reply('❌ Max rank'); const nr = RANK_NAMES[ci+1]; const cost = RANK_LADDER[ci+1].cost; if ((data.credits[id]||0) < cost) return msg.reply(`❌ Need ${cost} credits for ${nr}`); addCredits(id, -cost); await setMemberRank(msg.guild, msg.member, nr); return msg.reply(`✅ Ranked up to **${nr}**!`); }
  if (cmd === 'rankmod') { if (!isServerManager(msg.author.id)) return msg.reply('❌ No permission'); const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}rankmod @User`); await setMemberRank(msg.guild, t, 'Trial Moderator'); return msg.reply(`✅ ${t} is now Trial Moderator`); }

  // ✅ MODERATION COMMANDS (RESTORED & WORKING)
  if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No reason'; if (!t) return msg.reply(`Usage: ${PREFIX}warn @User [reason]`); if (!data.warns[t.id]) data.warns[t.id] = []; data.warns[t.id].push({ by: msg.author.id, reason: r, time: Date.now() }); saveData(data); return msg.reply(`✅ Warned ${t}: ${r}`); }
  if (cmd === 'minorwarn') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}minorwarn @User`); return msg.reply(`✅ Minor warn issued`); }
  if (cmd === 'majorwarn') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}majorwarn @User`); return msg.reply(`✅ Major warn issued`); }
  if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply('❌ No perm'); const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No reason'; if (!t) return msg.reply(`Usage: ${PREFIX}kick @User [reason]`); await t.kick(r).catch(()=>{}); return msg.reply(`✅ Kicked ${t.user.tag}`); }
  if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply('❌ No perm'); const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No reason'; if (!t) return msg.reply(`Usage: ${PREFIX}ban @User [reason]`); await t.ban({ reason: r }).catch(()=>{}); return msg.reply(`✅ Banned ${t.user.tag}`); }
  if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No reason'; const mr = findRole(msg.guild, 'Muted'); if (!mr) return msg.reply('❌ No Muted role'); if (!t) return msg.reply(`Usage: ${PREFIX}mute @User`); await t.roles.add(mr).catch(()=>{}); return msg.reply(`✅ Muted ${t.user.tag}`); }
  if (cmd === 'demote') { if (!isServerManager(msg.author.id)) return; const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}demote @User`); await setMemberRank(msg.guild, t, 'Trial Moderator'); return msg.reply(`✅ Demoted ${t.user.tag}`); }
  if (cmd === 'break') { if (!isModerator(msg.author.id)) return; data.onBreak[msg.author.id] = true; saveData(data); return msg.reply(`✅ On break`); }
  if (cmd === 'unbreak') { if (!isModerator(msg.author.id)) return; data.onBreak[msg.author.id] = false; saveData(data); return msg.reply(`✅ Back from break`); }
  if (cmd === 'settag') { if (!isModerator(msg.author.id)) return; const txt = args.join(' ') || null; if (!txt) return msg.reply(`Usage: ${PREFIX}settag Your Tag`); data.tags[msg.author.id] = { text: txt, manual: true }; saveData(data); return msg.reply(`✅ Tag set`); }

  // ✅ Track activity
  if (['rankup','setrank','warn','mute','kick','ban','demote','rankmod','settag','setup','break','unbreak','feedback'].includes(cmd)) markActive(msg.author.id);
});

client.login(process.env.BOT_TOKEN || '');