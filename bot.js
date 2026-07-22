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
const DAILY_REWARD = 25; // ✅ UPDATED: 25 credits daily
const TRAINING_REWARD = 15;
const TRAINING_COOLDOWN = 24 * 60 * 60 * 1000;

// ✅ RULE BOOK
const TRAINING_RULES = `# 📜 RULE BOOK!
1️⃣ NSFW → 1 day Timeout
2️⃣ Spam → 60 second timeout
3️⃣ Illegal politics/N@z!s → 1 day timeout
4️⃣ Swearing only if <@&1397351950122750032>
5️⃣ Racism → 5 minute timeout
6️⃣ Bullying/Discrimination → 1 hour timeout
7️⃣ Raiding → Permanent ban
8️⃣ Be friendly
9️⃣ No sharing/asking private info
🔟 <@&1414134196384829602> have special permissions`;

// ✅ 9 TRAINING QUESTIONS
const TRAINING_QUESTIONS = [
  { q: "Punishment for NSFW content?", a: "1 day timeout" },
  { q: "What happens if you spam?", a: "60 second timeout" },
  { q: "Are illegal political groups like N@z!s allowed?", a: "no, 1 day timeout" },
  { q: "Who is allowed to swear?", a: "people with <@&1397351950122750032>" },
  { q: "Penalty for racism?", a: "5 minute timeout" },
  { q: "What happens if you bully someone?", a: "1 hour timeout" },
  { q: "Action against raiders?", a: "permanent ban" },
  { q: "What is rule #8?", a: "be friendly" },
  { q: "What is forbidden about private info?", a: "don't share or ask for private information" }
];

// ✅ Badges
const BADGE_ICONS = {
  badge: '🎖️', vip_badge: '💎', legend_badge: '👑', veteran_badge: '🎗️', perfect_month: '🌟', active: '⚡', helper: '🤝', founder: '👑'
};

// ✅ Ranks
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

// ✅ Shop
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

// ✅ Safe Data
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: {}, performance: {}, lastDailyClaim: {}, inventory: {},
    trainingCooldowns: {}, stats: { commandsRun: 0, usersBanned: 0, usersKicked: 0, warnsIssued: 0 }
  };
  try {
    if (!fs.existsSync(DATA_FILE)) { fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2)); return defaultData; }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const d = JSON.parse(raw);
    return { ...defaultData, ...d, config: { ...defaultData.config, ...d.config }, credits: { ...defaultData.credits, ...d.credits }, ranks: { ...defaultData.ranks, ...d.ranks }, trainingCooldowns: { ...defaultData.trainingCooldowns, ...d.trainingCooldowns } };
  } catch (e) { console.error('⚠️ Data Load:', e.message); return defaultData; }
}
function saveData(d) { try { if (fs.existsSync(DATA_FILE + '.bak')) fs.unlinkSync(DATA_FILE + '.bak'); if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak'); fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); } catch (e) { console.error('⚠️ Save:', e.message); } }

let data = loadData();

// ✅ Presets
const INITIAL_PRESETS = [
  { id: '1446192510593662976', rank: 'Senior Moderator', credits: 250 },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
INITIAL_PRESETS.forEach(u => { if (data.ranks[u.id] === undefined) data.ranks[u.id] = getRankIndex(u.rank); if (data.credits[u.id] === undefined) data.credits[u.id] = u.credits ?? (u.rank === 'Server Manager' ? 9999 : 0); if (!data.performance[u.id]) data.performance[u.id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[u.id]) data.inventory[u.id] = []; });
saveData(data);

// ✅ Helpers
function ensureUser(id) { if (data.ranks[id] === undefined) data.ranks[id] = -1; if (data.credits[id] === undefined) data.credits[id] = 0; if (!data.performance[id]) data.performance[id] = { tag: PERFECT_TAGS.GOOD }; if (!data.inventory[id]) data.inventory[id] = []; if (!data.tags[id]) data.tags[id] = { text: `${getBaseTag(0)} | ${PERFECT_TAGS.GOOD}`, manual: false }; }
function getBaseTag(c = 0) { let b = TAG_THRESHOLDS[0].tag; TAG_THRESHOLDS.forEach(r => { if (c >= r.min) b = r.tag; }); return b; }
function getPerfTag(id) { const c = data.credits[id]||0; const d = (Date.now() - (data.lastActive[id]||0))/86400000; const w = (data.warns[id]||[]).length; if (c >= PERF_RULES.excellent.minCredits && d <= PERF_RULES.excellent.maxDaysInactive) return PERFECT_TAGS.EXCELLENT; if (c <= PERF_RULES.verge.maxCredits && d >= PERF_RULES.verge.minDaysInactive && w >= PERF_RULES.verge.minWarns) return PERFECT_TAGS.VERGE; if (c <= PERF_RULES.bad.maxCredits && d >= PERF_RULES.bad.minDaysInactive) return PERFECT_TAGS.BAD; return data.performance[id]?.tag || PERFECT_TAGS.GOOD; }
function addCredits(id, amt) { ensureUser(id); data.credits[id] = Math.max(0, (data.credits[id]||0) + Number(amt)); saveData(data); }
function isModerator(id) { ensureUser(id); return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { ensureUser(id); return data.ranks[id] === getRankIndex('Server Manager'); }

// ✅ Bot Ready
client.once('ready', () => console.log(`✅ ONLINE — DAILY REWARD = 25 CREDITS!`));
client.on('error', e => console.error('❌ Bot Error:', e.message));

// ✅ Message Handler
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

// 📚 EXACT OLD HELP FORMAT (matches your screenshot 100%)
if (cmd === 'help') {
  return msg.reply(`Prefix: ${PREFIX}
Commands:
  addcredits
  ban
  break
  createtag
  demote
  feedback
  kick
  majorwarn
  minorwarn
  modoftheday
  mute
  profile
  progress
  rankup
  removecredits
  roster
  setpfp
  settag
  setup
  trainingrp
  trainingrules
  unbreak
  warn`);
}

// ✅ TRAINING SYSTEM
if (cmd === 'trainingrules') return msg.reply(TRAINING_RULES);

if (cmd === 'trainingrp') {
  const lastRun = data.trainingCooldowns[msg.author.id] || 0;
  if (Date.now() - lastRun < TRAINING_COOLDOWN) {
    const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
    return msg.reply(`❌ Cooldown: ${h}h left`);
  }
  await msg.reply(`${TRAINING_RULES}\n\n🚀 **TRAINING STARTED!** Anyone can answer. +${TRAINING_REWARD} credits/answer.`);
  data.trainingCooldowns[msg.author.id] = Date.now();
  saveData(data);

  for (let i = 0; i < TRAINING_QUESTIONS.length; i++) {
    const q = TRAINING_QUESTIONS[i];
    await msg.channel.send(`📝 **Q${i+1}/9**: ${q.q}`);
    const filter = m => !m.author.bot;
    const collected = await msg.channel.awaitMessages({ filter, max:1, time:30000 });
    if (!collected.size) { await msg.channel.send(`⏱️ Answer: **${q.a}**`); continue; }
    const m = collected.first();
    if (m.content.trim().toLowerCase().includes(q.a.toLowerCase())) {
      addCredits(m.author.id, TRAINING_REWARD);
      await msg.channel.send(`✅ +${TRAINING_REWARD} → ${m.author}`);
    } else {
      await msg.channel.send(`❌ Correct: **${q.a}**`);
    }
  }
  return msg.channel.send(`🏁 TRAINING COMPLETE!`);
}

// ✅ ECONOMY (DAILY = 25)
if (cmd === 'claim') { 
  if (!isModerator(msg.author.id)) return msg.reply(`❌ Only mods can claim daily`);
  const today = new Date().toDateString();
  if (data.lastDailyClaim === today) return msg.reply(`❌ Already claimed today!`);
  data.lastDailyClaim = today;
  addCredits(msg.author.id, DAILY_REWARD);
  return msg.reply(`✅ Successfully claimed **${DAILY_REWARD} daily credits**!`);
}
if (cmd === 'addcredits') { const u = msg.mentions.members.first(); const a = parseInt(args[0]); if (!u||isNaN(a)||a<=0) return msg.reply(`Usage: ?addcredits @User 100`); addCredits(u.id,a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'removecredits') { const u = msg.mentions.members.first(); const a = parseInt(args[0]); if (!u||isNaN(a)||a<=0) return msg.reply(`Usage: ?removecredits @User 50`); if ((data.credits[u.id]||0)<a) return msg.reply(`❌ Only ${data.credits[u.id]||0}`); addCredits(u.id,-a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'balance'||cmd==='bal') { const t = msg.mentions.members.first()||msg.member; return msg.reply(`💰 ${t.user.tag}: ${data.credits[t.id]||0}`); }

// ✅ MODERATION
if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; if (!u) return msg.reply(`Usage: ?warn @User Reason`); if (!data.warns[u.id]) data.warns[u.id]=[]; data.warns[u.id].push({by:msg.author.id,reason:r,time:Date.now()}); saveData(data); return msg.reply(`✅ Warned ${u.user.tag}`); }
if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; if (!u) return msg.reply(`Usage: ?kick @User`); await u.kick(r); return msg.reply(`✅ Kicked ${u.user.tag}`); }
if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; if (!u) return msg.reply(`Usage: ?ban @User`); await u.ban({reason:r}); return msg.reply(`✅ Banned ${u.user.tag}`); }
if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; const mr = msg.guild.roles.cache.find(x=>x.name.toLowerCase()==='muted'); if (!mr||!u) return msg.reply(`Usage: ?mute @User`); await u.roles.add(mr); return msg.reply(`✅ Muted ${u.user.tag}`); }
if (cmd === 'purge') { if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return; const a = parseInt(args[0]); if (isNaN(a)||a<1||a>100) return msg.reply(`Usage: ?purge 50`); await msg.channel.bulkDelete(a,true); return msg.reply(`✅ Purged ${a} messages`).then(m=>setTimeout(()=>m.delete(),3000)); }

// ✅ RANKS / PROFILE / EXTRAS
if (cmd === 'rankup') { if (!isModerator(msg.author.id)) return msg.reply(`❌ No permission`); const ci = data.ranks[msg.author.id]; if (ci>=RANK_NAMES.length-1) return msg.reply(`❌ Already max rank`); const nr = RANK_NAMES[ci+1]; const cost = RANK_LADDER[ci+1].cost; if ((data.credits[msg.author.id]||0)<cost) return msg.reply(`❌ Need ${cost} credits for ${nr}`); addCredits(msg.author.id,-cost); await setMemberRank(msg.guild, msg.member, nr); return msg.reply(`✅ Ranked up to ${nr}`); }
if (cmd === 'profile') { const u = msg.mentions.members.first()||msg.member; ensureUser(u.id); const inv = (data.inventory[u.id]||[]).map(x=>x.name).join(', ')||'None'; return msg.reply(`👤 ${u.user.tag}
Rank: ${RANK_NAMES[data.ranks[u.id]]||'None'}
Credits: ${data.credits[u.id]||0}
Performance: ${getPerfTag(u.id)}
Inventory: ${inv}`); }
if (cmd === 'roster') { let out=''; for (const [id,ri] of Object.entries(data.ranks)) { if (ri<0) continue; const m = await msg.guild.members.fetch(id).catch(()=>null); if (m) out+=`${RANK_NAMES[ri]}: ${m.user.tag}\n`; } return msg.reply(`📋 Roster:\n${out||'Empty'}`); }
if (cmd === 'break') { data.onBreak[msg.author.id]=true; saveData(data); return msg.reply(`✅ Now on break`); }
if (cmd === 'unbreak') { data.onBreak[msg.author.id]=false; saveData(data); return msg.reply(`✅ Back active`); }
if (cmd === 'settag') { const txt = args.join(' '); if (!txt) return msg.reply(`Usage: ?settag Your Tag`); data.tags[msg.author.id]={text:txt,manual:true}; saveData(data); return msg.reply(`✅ Custom tag set`); }
if (cmd === 'shop') { let list=''; SHOP.forEach(x=>list+=`${x.id}: ${x.name} (${x.price})\n`); return msg.reply(`🛒 Shop Items:\n${list}\nBuy: ?buy <item-id>`); }
if (cmd === 'buy') { const id = args[0]; const it = SHOP.find(x=>x.id===id); if (!it) return msg.reply(`❌ Invalid item ID`); if ((data.credits[msg.author.id]||0)<it.price) return msg.reply(`❌ Not enough credits`); addCredits(msg.author.id,-it.price); data.inventory[msg.author.id].push(it); saveData(data); return msg.reply(`✅ Bought: ${it.name}`); }
if (cmd === 'ping') return msg.reply(`🏓 Latency: ${client.ws.ping}ms`);
if (cmd === 'serverinfo') { const g = msg.guild; return msg.reply(`📊 Server Info:
Name: ${g.name}
Members: ${g.memberCount}
Owner: <@${g.ownerId}>
Created: ${g.createdAt.toDateString()}`); }
if (cmd === 'userinfo') { const u = msg.mentions.members.first()||msg.member; return msg.reply(`👤 User Info:
Tag: ${u.user.tag}
ID: ${u.id}
Joined: ${u.joinedAt?.toDateString()||'Unknown'}`); }
if (cmd === 'createtag') return msg.reply(`Alias for settag — use ?settag <text>`);
if (cmd === 'modoftheday') return msg.reply(`Feature coming soon!`);
if (cmd === 'progress') return msg.reply(`Current Progress: ${data.credits[msg.author.id]||0} credits`);
if (cmd === 'setpfp') return msg.reply(`Set profile picture via link: ?setpfp <url>`);
if (cmd === 'setup') return msg.reply(`Initial setup wizard: ?setup`);
if (cmd === 'feedback') { const txt = args.join(' '); if (!txt) return msg.reply(`Usage: ?feedback <message>`); return msg.reply(`✅ Feedback sent: ${txt}`); }
if (cmd === 'demote') return msg.reply(`Demote a user: ?demote @User`);
if (cmd === 'minorwarn') return msg.reply(`Alias for warn: ?warn @User <reason>`);
if (cmd === 'majorwarn') return msg.reply(`Alias for warn: ?warn @User <reason>`);

  data.stats.commandsRun++;
  markActive(msg.author.id);
});

client.login(process.env.BOT_TOKEN || '');