require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ Railway Safe Path
const DATA_FILE = path.resolve('./data.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

const PREFIX = '?';
const GUILD_ID = '1324059331406069872';
const PROFILE_CHANNEL_ID = '1528326521721196544';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const DAILY_REWARD = 5;

// ✅ Badge Icons
const BADGE_ICONS = {
  badge: '🎖️', vip_badge: '💎', legend_badge: '👑', veteran_badge: '🎗️', perfect_month: '🌟',
  active: '⚡', helper: '🤝', founder: '👑'
};

// ✅ Rank Structure
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

// ✅ Shop Items
const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', desc: 'Set own profile tag', price: 100 },
  { id: 'color_role', name: 'Custom Color Role', desc: 'Unique color', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', desc: 'VIP Icon', price: 400, icon: BADGE_ICONS.vip_badge },
  { id: 'custom_embed', name: 'Custom Profile Layout', desc: 'Fancy design', price: 600 },
  { id: 'glory_role', name: 'Glory Role', desc: 'Priority position', price: 800 },
  { id: 'badge', name: 'Badge', desc: '🎖️ Permanent icon', price: 900, icon: BADGE_ICONS.badge },
  { id: 'profile_background', name: 'Profile Background', desc: 'Custom art', price: 500 },
  { id: 'signature', name: 'Custom Signature', desc: 'Sign logs', price: 200 },
  { id: 'rainbow_role', name: 'Rainbow Role', desc: 'Color shifting', price: 1200 },
  { id: 'double_daily', name: 'Double Daily', desc: '+10 daily forever', price: 300 },
  { id: 'skip_cooldown', name: 'No Cooldowns', desc: 'Instant commands', price: 500 },
  { id: 'extended_access', name: 'Extended Access', desc: 'Hidden channels', price: 650 },
  { id: 'silent_mode', name: 'Silent Mode', desc: 'Quiet commands', price: 350 },
  { id: 'mention_exempt', name: 'Mention Immunity', desc: 'No pings', price: 700 },
  { id: 'voice_priority', name: 'Voice Priority', desc: 'Talk first', price: 400 },
  { id: 'senior_eligibility', name: 'Senior Mod Eligibility', desc: 'Early promotion', price: 150 },
  { id: 'performance_boost', name: 'Performance Boost', desc: '2x faster rank', price: 350 },
  { id: 'credit_booster', name: 'Credit Booster', desc: '+25% all credits', price: 600 },
  { id: 'inactivity_protect', name: 'Inactivity Shield', desc: 'No auto-demote', price: 500 },
  { id: 'mod_mentor', name: 'Mentor Status', desc: 'Help new mods', price: 800 },
  { id: 'legend_badge', name: 'Legendary Badge', desc: 'Rare honor', price: 1000, icon: BADGE_ICONS.legend_badge },
  { id: 'veteran_badge', name: 'Veteran Badge', desc: 'Long service', price: 750, icon: BADGE_ICONS.veteran_badge },
  { id: 'perfect_month', name: 'Perfect Month Award', desc: 'Zero warn', price: 600, icon: BADGE_ICONS.perfect_month },
  { id: 'custom_emoji', name: 'Custom Emoji Slot', desc: 'Add emoji', price: 350 },
  { id: 'pet_buddy', name: 'Virtual Pet', desc: 'Pet on profile', price: 400 }
];

const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' }, { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' }, { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' }
];
const PERFECT_TAGS = { GOOD: 'Good', EXCELLENT: 'Excellent', BAD: 'Bad', VERGE: 'Verge of Demotion' };
const PERF_RULES = {
  excellent: { minCredits: 500, maxDaysInactive: 21 },
  bad: { maxCredits: 100, minDaysInactive: 7 },
  verge: { maxCredits: 50, minDaysInactive: 3, minWarns: 2 }
};

// ✅ Safe Data System
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: {}, performance: {}, lastDailyClaim: {}, inventory: {},
    mutes: {}, stats: { commandsRun: 0, usersBanned: 0, usersKicked: 0, warnsIssued: 0 }
  };
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2)); return defaultData; }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    return { ...defaultData, ...d, config: { ...defaultData.config, ...d.config }, credits: { ...defaultData.credits, ...d.credits }, ranks: { ...defaultData.ranks, ...d.ranks }, inventory: { ...defaultData.inventory, ...d.inventory }, stats: { ...defaultData.stats, ...d.stats } };
  } catch (e) { console.error('⚠️ Data Load:', e.message); return defaultData; }
}
function saveData(d) { try { if (fs.existsSync(DATA_FILE + '.bak')) fs.unlinkSync(DATA_FILE + '.bak'); if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak'); fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch (e) { console.error('⚠️ Save:', e.message); } }

let data = loadData();

// ✅ Initial Presets
const INITIAL_PRESETS = [
  { id: '1446192510593662976', rank: 'Senior Moderator', credits: 250 },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
INITIAL_PRESETS.forEach(u => { if (data.ranks[u.id] === undefined) data.ranks[u.id] = getRankIndex(u.rank); if (data.credits[u.id] === undefined) data.credits[u.id] = u.credits ?? (u.rank === 'Server Manager' ? 9999 : 0); if (!data.performance[u.id]) data.performance[u.id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[u.id]) data.inventory[u.id] = []; });
saveData(data);

// ✅ Core Helpers (NO LOOPS)
function ensureUser(id) { if (data.ranks[id] === undefined) data.ranks[id] = -1; if (data.credits[id] === undefined) data.credits[id] = 0; if (!data.performance[id]) data.performance[id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[id]) data.inventory[id] = []; if (!data.tags[id]) data.tags[id] = { text: `${getBaseTag(0)} | ${PERFECT_TAGS.GOOD}`, manual: false }; }
function getBaseTag(c = 0) { let b = TAG_THRESHOLDS[0].tag; TAG_THRESHOLDS.forEach(r => { if (c >= r.min) b = r.tag; }); return b; }
function getPerfTag(id) { const c = data.credits[id]||0; const d = (Date.now() - (data.lastActive[id]||0))/86400000; const w = (data.warns[id]||[]).length; if (c >= PERF_RULES.excellent.minCredits && d <= PERF_RULES.excellent.maxDaysInactive) return PERFECT_TAGS.EXCELLENT; if (c <= PERF_RULES.verge.maxCredits && d >= PERF_RULES.verge.minDaysInactive && w >= PERF_RULES.verge.minWarns) return PERFECT_TAGS.VERGE; if (c <= PERF_RULES.bad.maxCredits && d >= PERF_RULES.bad.minDaysInactive) return PERFECT_TAGS.BAD; return data.performance[id]?.tag || PERFECT_TAGS.GOOD; }
function getFullTag(id) { return `${getBaseTag(data.credits[id]||0)} | ${getPerfTag(id)}`; }
function getUserDisplay(id, name) { ensureUser(id); const badges = (data.inventory[id]||[]).map(i => SHOP.find(x => x.id === i.id)?.icon).filter(Boolean); return `${name} — ${getFullTag(id)} ${badges.join(' ')}`; }
function refreshTag(id) { ensureUser(id); if (!data.tags[id]?.manual) data.tags[id].text = getFullTag(id); saveData(data); }
function addCredits(id, amt) { ensureUser(id); data.credits[id] = Math.max(0, (data.credits[id]||0) + Number(amt)); refreshTag(id); }
function markActive(id) { ensureUser(id); data.lastActive[id] = Date.now(); }
function isModerator(id) { ensureUser(id); return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { ensureUser(id); return data.ranks[id] === getRankIndex('Server Manager'); }
function findRole(g, n) { return g.roles.cache.find(r => r.name.toLowerCase() === n.toLowerCase()); }
async function setMemberRank(g, m, rn) { ensureUser(m.id); const ni = getRankIndex(rn); if (ni === -1) return null; const oi = data.ranks[m.id] ?? -1; if (oi >= 0) { const or = findRole(g, RANK_NAMES[oi]); if (or) await m.roles.remove(or).catch(()=>{}); } const nr = findRole(g, rn); if (nr) await m.roles.add(nr).catch(()=>{}); data.ranks[m.id] = ni; refreshTag(m.id); saveData(data); return { old: RANK_NAMES[oi]||'None', new: rn }; }

// ✅ Bot Ready
client.once('ready', () => console.log(`✅ ONLINE — REMOVE CREDITS FIXED!`));
client.on('error', e => console.error('❌ Bot Error:', e.message));

// ✅ Message Handler
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  data.stats.commandsRun++;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

// 📚 HELP
if (cmd === 'help') {
  return msg.reply(`\`\`\`
Prefix: ${PREFIX}
📈 ECONOMY: ?claim, ?addcredits, ?removecredits, ?balance, ?richlist
🛒 SHOP & PROFILE: ?shop, ?buy, ?profile, ?roster, ?settag
👑 RANKS: ?rankup, ?rankmod, ?setrank, ?mystats
🛡️ MODERATION: ?warn, ?warnings, ?clearwarns, ?kick, ?ban, ?unban, ?mute, ?unmute, ?purge
✨ EXTRAS: ?ping, ?uptime, ?serverinfo, ?userinfo, ?avatar, ?say, ?embed
\`\`\``);
}

// ✅ FIXED ECONOMY COMMANDS
if (cmd === 'claim') { if (!isModerator(msg.author.id)) return msg.reply('❌ Mods only'); const t = new Date().toDateString(); if (data.lastDailyClaim[msg.author.id] === t) return msg.reply('❌ Already claimed today'); data.lastDailyClaim[msg.author.id] = t; addCredits(msg.author.id, DAILY_REWARD); return msg.reply(`✅ +${DAILY_REWARD} Daily Credits!`); }

if (cmd === 'addcredits') {
  const user = msg.mentions.members.first();
  const amount = parseInt(args[1]);
  if (!user || isNaN(amount) || amount <= 0) return msg.reply(`Usage: ${PREFIX}addcredits @User 100`);
  addCredits(user.id, amount);
  return msg.reply(`✅ ${user.user.tag}: ${data.credits[user.id]} credits`);
}

// ✅ PERMANENT FIXED REMOVE CREDITS
if (cmd === 'removecredits') {
  const user = msg.mentions.members.first();
  const amount = parseInt(args[1]);
  if (!user || isNaN(amount) || amount <= 0) return msg.reply(`Usage: ${PREFIX}removecredits @User 50`);
  if ((data.credits[user.id] || 0) < amount) return msg.reply(`❌ User only has ${data.credits[user.id] || 0} credits`);
  addCredits(user.id, -amount);
  return msg.reply(`✅ ${user.user.tag}: ${data.credits[user.id]} credits`);
}

if (cmd === 'balance' || cmd === 'bal') { const t = msg.mentions.members.first() || msg.member; return msg.reply(`💰 ${t.user.tag}: ${data.credits[t.id]||0} credits`); }
if (cmd === 'shop') { const e = new EmbedBuilder().setTitle('🛒 Shop').setColor(0xFFD700); SHOP.forEach(i => e.addFields({ name: `${i.icon||''} ${i.name} — ${i.price}`, value: i.desc })); return msg.reply({ embeds: [e] }); }
if (cmd === 'buy') { const i = args[0]?.toLowerCase(); const it = SHOP.find(x => x.id === i); if (!it) return msg.reply('❌ Invalid item — ?shop'); if ((data.credits[msg.author.id]||0) < it.price) return msg.reply('❌ Not enough credits'); addCredits(msg.author.id, -it.price); data.inventory[msg.author.id].push(it); saveData(data); return msg.reply(`✅ Bought **${it.icon||''} ${it.name}**`); }
if (cmd === 'roster') { const g = {}; RANK_NAMES.forEach(r => g[r] = []); for (const [uid] of Object.entries(data.ranks)) { const ri = data.ranks[uid]; const rn = RANK_NAMES[ri]; const m = await msg.guild.members.fetch(uid).catch(()=>null); if (m) g[rn].push(getUserDisplay(uid, m.user.tag)); } const e = new EmbedBuilder().setTitle('📋 Roster').setColor(0x2ECC71); [...RANK_NAMES].reverse().forEach(r => { if (g[r].length) e.addFields({ name: r, value: g[r].join('\n') }); }); return msg.reply({ embeds: [e] }); }
if (cmd === 'profile') { const t = msg.mentions.members.first() || msg.member; ensureUser(t.id); const inv = (data.inventory[t.id]||[]).map(i => { const s = SHOP.find(x => x.id === i.id); return `${s?.icon||''} ${s?.name||i.name}`; }).join(', ') || 'None'; const e = new EmbedBuilder().setTitle(`${t.user.tag}'s Profile`).addFields({ name: 'Rank', value: RANK_NAMES[data.ranks[t.id]??-1]||'—', inline: true }, { name: 'Credits', value: `${data.credits[t.id]||0}`, inline: true }, { name: 'Performance', value: getPerfTag(t.id), inline: true }, { name: 'Inventory', value: inv }).setColor(0x5865F2); return msg.reply({ embeds: [e] }); }
if (cmd === 'setrank' && isServerManager(msg.author.id)) { const t = msg.mentions.members.first(); const rn = args.slice(1).join(' '); if (!t || !RANK_NAMES.includes(rn)) return msg.reply(`Usage: ${PREFIX}setrank @User "Rank Name"`); const res = await setMemberRank(msg.guild, t, rn); return msg.reply(`✅ Rank Changed: ${res.old} → ${res.new}`); }
if (cmd === 'rankup') { const id = msg.author.id; if (!isModerator(id)) return msg.reply('❌ Not Moderator'); const ci = data.ranks[id]; if (ci >= RANK_NAMES.length - 1) return msg.reply('❌ Max Rank'); const nr = RANK_NAMES[ci+1]; const cost = RANK_LADDER[ci+1].cost; if ((data.credits[id]||0) < cost) return msg.reply(`❌ Need ${cost} credits for ${nr}`); addCredits(id, -cost); await setMemberRank(msg.guild, msg.member, nr); return msg.reply(`✅ Promoted to **${nr}**!`); }
if (cmd === 'rankmod') { if (!isServerManager(msg.author.id)) return msg.reply('❌ No Permission'); const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}rankmod @User`); await setMemberRank(msg.guild, t, 'Trial Moderator'); return msg.reply(`✅ ${t} is now Trial Moderator`); }

// 🛡️ MODERATION
if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No Reason'; if (!t) return msg.reply(`Usage: ${PREFIX}warn @User Reason`); if (!data.warns[t.id]) data.warns[t.id] = []; data.warns[t.id].push({ by: msg.author.id, reason: r, time: Date.now() }); data.stats.warnsIssued++; saveData(data); return msg.reply(`✅ Warned ${t.user.tag}: ${r}`); }
if (cmd === 'warnings') { const t = msg.mentions.members.first() || msg.member; const w = data.warns[t.id] || []; return msg.reply(`⚠️ ${t.user.tag} Warnings (${w.length}):\n${w.map((x,i)=>`${i+1}. ${x.reason}`).join('\n')||'None'}`); }
if (cmd === 'clearwarns') { if (!isServerManager(msg.author.id)) return; const t = msg.mentions.members.first(); if (!t) return msg.reply(`Usage: ${PREFIX}clearwarns @User`); data.warns[t.id] = []; saveData(data); return msg.reply(`✅ Cleared warnings for ${t.user.tag}`); }
if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return msg.reply('❌ No Permission'); const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No Reason'; if (!t) return msg.reply(`Usage: ${PREFIX}kick @User Reason`); await t.kick(r).catch(()=>{}); data.stats.usersKicked++; return msg.reply(`✅ Kicked ${t.user.tag}`); }
if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return msg.reply('❌ No Permission'); const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No Reason'; if (!t) return msg.reply(`Usage: ${PREFIX}ban @User Reason`); await t.ban({ reason: r }).catch(()=>{}); data.stats.usersBanned++; return msg.reply(`✅ Banned ${t.user.tag}`); }
if (cmd === 'unban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; const id = args[0]; if (!id) return msg.reply(`Usage: ${PREFIX}unban UserID`); await msg.guild.members.unban(id).catch(()=>{}); return msg.reply(`✅ Unbanned ${id}`); }
if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); const r = args.slice(1).join(' ') || 'No Reason'; const mr = findRole(msg.guild, 'Muted'); if (!mr) return msg.reply('❌ Create "Muted" role first'); if (!t) return msg.reply(`Usage: ${PREFIX}mute @User`); await t.roles.add(mr).catch(()=>{}); data.mutes[t.id] = true; return msg.reply(`✅ Muted ${t.user.tag}`); }
if (cmd === 'unmute') { if (!isModerator(msg.author.id)) return; const t = msg.mentions.members.first(); const mr = findRole(msg.guild, 'Muted'); if (!mr || !t) return msg.reply(`Usage: ${PREFIX}unmute @User`); await t.roles.remove(mr).catch(()=>{}); data.mutes[t.id] = false; return msg.reply(`✅ Unmuted ${t.user.tag}`); }
if (cmd === 'purge') { if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return; const a = parseInt(args[0]); if (isNaN(a) || a < 1 || a > 100) return msg.reply(`Usage: ${PREFIX}purge 50`); await msg.channel.bulkDelete(a, true).catch(()=>{}); return msg.reply(`✅ Purged ${a} messages`).then(m=>setTimeout(()=>m.delete(),3000)); }

// ✅ EXTRAS
if (cmd === 'ping') return msg.reply(`🏓 Pong: ${client.ws.ping}ms`);
if (cmd === 'uptime') { const u = process.uptime(); const d = Math.floor(u/86400); const h = Math.floor((u%86400)/3600); const m = Math.floor((u%3600)/60); return msg.reply(`⏱️ Uptime: ${d}d ${h}h ${m}m`); }
if (cmd === 'serverinfo') { const g = msg.guild; const e = new EmbedBuilder().setTitle(`📊 ${g.name}`).addFields({name:'Members',value:`${g.memberCount}`},{name:'Owner',value:`<@${g.ownerId}>`},{name:'Created',value:g.createdAt.toDateString()}).setColor(0x3498db); return msg.reply({embeds:[e]}); }
if (cmd === 'userinfo') { const t = msg.mentions.members.first() || msg.member; const e = new EmbedBuilder().setTitle(`👤 ${t.user.tag}`).addFields({name:'ID',value:t.id},{name:'Joined',value:t.joinedAt?.toDateString()||'?'},{name:'Created',value:t.user.createdAt.toDateString()}).setColor(0x2ecc71); return msg.reply({embeds:[e]}); }
if (cmd === 'avatar') { const t = msg.mentions.users.first() || msg.author; return msg.reply(t.displayAvatarURL({size:1024})); }
if (cmd === 'say') { if (!isModerator(msg.author.id)) return; const text = args.join(' '); if (!text) return msg.reply('❌ No text'); return msg.channel.send(text); }
if (cmd === 'settag') { if (!isModerator(msg.author.id)) return; const txt = args.join(' ') || null; if (!txt) return msg.reply(`Usage: ${PREFIX}settag Your Tag`); data.tags[msg.author.id] = { text: txt, manual: true }; saveData(data); return msg.reply(`✅ Custom Tag Set`); }
if (cmd === 'richlist') { const sorted = Object.entries(data.credits).sort((a,b)=>b[1]-a[1]).slice(0,10); const e = new EmbedBuilder().setTitle('💎 Top 10 Richest').setColor(0xf39c12); sorted.forEach(([id,cr],i)=>e.addFields({name:`#${i+1}`,value:`<@${id}> — ${cr} credits`})); return msg.reply({embeds:[e]}); }

  markActive(msg.author.id);
});

client.login(process.env.BOT_TOKEN || '');