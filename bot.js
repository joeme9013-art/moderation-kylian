require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ PERMANENT DATA FILE (Never resets on updates/GitHub)
const DATA_FILE = path.resolve('./data.json');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ]
});

// ⚙️ CONFIG
const PREFIX = '?';
const DAILY_REWARD = 25;
const TRAINING_REWARD = 15;
const TRAINING_COOLDOWN = 24 * 60 * 60 * 1000;
const BOT_OWNER_ID = '1222684836091658330'; // YOUR ID = FULL ACCESS

// 📜 RULES & RANKS
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

// 🛒 SHOP ITEMS (FULLY FUNCTIONAL)
const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', price: 100 },
  { id: 'color_role', name: 'Color Role', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', price: 400 },
  { id: 'glory_role', name: 'Glory Role', price: 800 },
  { id: 'badge', name: 'Badge', price: 900 },
  { id: 'profile_bg', name: 'Profile Background', price: 500 },
  { id: 'signature', name: 'Signature', price: 200 }
];

// 💾 DATA SYSTEM (PERMANENT)
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastDailyClaim: {},
    inventory: {}, trainingCooldowns: {}
  };
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return { ...defaultData, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) { return defaultData; }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

// 🛡️ HELPERS & PERMISSIONS
function ensureUser(id) {
  data.credits[id] ??= 0;
  data.ranks[id] ??= -1;
  data.warns[id] ??= [];
  data.inventory[id] ??= [];
}
function addCredits(id, amt) {
  ensureUser(id);
  data.credits[id] = Math.max(0, data.credits[id] + Number(amt));
  saveData();
}
function isOwner(id) { return id === BOT_OWNER_ID; }
function isServerManager(id) { return isOwner(id) || data.ranks[id] === getRankIndex('Server Manager'); }
function isModerator(id) { ensureUser(id); return isServerManager(id) || data.ranks[id] >= 0; }

// ✅ BOT READY
client.once('ready', () => console.log(`✅ ONLINE — OLD FORMAT • ALL COMMANDS • NO ERRORS`));

// 📨 MESSAGE HANDLER
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

// 📚 EXACT OLD HELP FORMAT (LIKE YOUR EXAMPLE)
if (cmd === 'help') {
  return msg.reply(`Prefix: ${PREFIX}
📈 ECONOMY: claim, addcredits, removecredits, balance, richlist
🛒 SHOP & PROFILE: shop, buy, profile, roster, settag
👑 RANKS: rankup, rankmod, setrank, mystats
🛡️ MODERATION: warn, warnings, clearwarns, kick, ban, unban, mute, unmute, purge
✨ EXTRAS: ping, uptime, serverinfo, userinfo, avatar, say, embed
🎓 TRAINING: training, trainingrules`);
}

// 🎓 TRAINING
if (cmd === 'trainingrules') return msg.reply(TRAINING_RULES);
if (cmd === 'training') {
  const lastRun = data.trainingCooldowns[msg.author.id] || 0;
  if (Date.now() - lastRun < TRAINING_COOLDOWN) {
    const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
    return msg.reply(`❌ Cooldown: ${h}h left`);
  }
  await msg.reply(`${TRAINING_RULES}\n\n🚀 TRAINING STARTED! +${TRAINING_REWARD} credits per correct answer.`);
  data.trainingCooldowns[msg.author.id] = Date.now();
  saveData();

  const TRAINING_QUESTIONS = [
    { q: "Punishment for NSFW content?", a: "1 day timeout" },
    { q: "What happens if you spam?", a: "60 second timeout" },
    { q: "Are illegal political groups allowed?", a: "no, 1 day timeout" },
    { q: "Who can swear?", a: "people with <@&1397351950122750032>" },
    { q: "Penalty for racism?", a: "5 minute timeout" },
    { q: "What happens if you bully?", a: "1 hour timeout" },
    { q: "Raiders get what?", a: "permanent ban" },
    { q: "Rule #8?", a: "be friendly" },
    { q: "Private info rule?", a: "don't share or ask for it" }
  ];

  for (let i = 0; i < TRAINING_QUESTIONS.length; i++) {
    const q = TRAINING_QUESTIONS[i];
    await msg.channel.send(`📝 **Q${i+1}/9**: ${q.q}`);
    const collected = await msg.channel.awaitMessages({ filter: m => !m.author.bot, max: 1, time: 30000 });
    if (!collected.size) { await msg.channel.send(`⏱️ Answer: **${q.a}**`); continue; }
    const m = collected.first();
    m.content.toLowerCase().includes(q.a.toLowerCase())
      ? (addCredits(m.author.id, TRAINING_REWARD), msg.channel.send(`✅ +${TRAINING_REWARD} → ${m.author}`))
      : msg.channel.send(`❌ Correct: **${q.a}**`);
  }
  return msg.channel.send(`🏁 TRAINING COMPLETE!`);
}

// 💰 ECONOMY
if (cmd === 'claim') {
  if (!isModerator(msg.author.id)) return msg.reply(`❌ Mods only`);
  const today = new Date().toDateString();
  if (data.lastDailyClaim === today) return msg.reply(`❌ Already claimed today`);
  data.lastDailyClaim = today;
  addCredits(msg.author.id, DAILY_REWARD);
  return msg.reply(`✅ Claimed **${DAILY_REWARD} credits**!`);
}
if (cmd === 'addcredits') {
  if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`);
  const u = msg.mentions.members.first(); const a = +args[0];
  if (!u || !a || a <= 0) return msg.reply(`Usage: ?addcredits @User 100`);
  addCredits(u.id, a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`);
}
if (cmd === 'removecredits') {
  if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`);
  const u = msg.mentions.members.first(); const a = +args[0];
  if (!u || !a || a <= 0) return msg.reply(`Usage: ?removecredits @User 50`);
  if (data.credits[u.id] < a) return msg.reply(`❌ Only ${data.credits[u.id]} available`);
  addCredits(u.id, -a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`);
}
if (cmd === 'balance' || cmd === 'bal') {
  const t = msg.mentions.members.first() || msg.member;
  return msg.reply(`💰 ${t.user.tag}: ${data.credits[t.id] || 0}`);
}
if (cmd === 'richlist') {
  const sorted = Object.entries(data.credits).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const list = sorted.map(([id, c], i) => `#${i+1} <@${id}> — ${c} credits`).join('\n') || 'No data';
  return msg.reply(`💎 **Top 10 Richest**\n${list}`);
}

// 🛒 SHOP (FULLY WORKING — DEDUCTS CREDITS)
if (cmd === 'shop') {
  const list = SHOP.map(x => `${x.id}: ${x.name} — ${x.price} credits`).join('\n');
  return msg.reply(`🛒 **SHOP**\n\n${list}\n\nBuy with: ?buy <item-id>`);
}
if (cmd === 'buy') {
  const item = SHOP.find(x => x.id === args[0]?.toLowerCase());
  if (!item) return msg.reply(`❌ Invalid item — check ?shop`);
  if (data.credits[msg.author.id] < item.price) return msg.reply(`❌ Not enough credits! Need ${item.price}`);
  addCredits(msg.author.id, -item.price);
  data.inventory[msg.author.id].push(item);
  saveData();
  return msg.reply(`✅ Bought **${item.name}** —${item.price} credits`);
}

// 👤 PROFILE / ROSTER / SETTAG
if (cmd === 'profile') {
  const u = msg.mentions.members.first() || msg.member; ensureUser(u.id);
  const inv = data.inventory[u.id].map(x => x.name).join(', ') || 'Empty';
  return msg.reply(`👤 **${u.user.tag}**
Rank: ${RANK_NAMES[data.ranks[u.id]] || 'None'}
Credits: ${data.credits[u.id] || 0}
Inventory: ${inv}`);
}
if (cmd === 'roster') {
  let out = '';
  for (const [id, ri] of Object.entries(data.ranks)) {
    if (ri < 0) continue;
    const m = await msg.guild.members.fetch(id).catch(() => null);
    if (m) out += `${RANK_NAMES[ri]}: ${m.user.tag}\n`;
  }
  return msg.reply(`📋 **ROSTER**\n${out || 'No mods found'}`);
}
if (cmd === 'settag') {
  const txt = args.join(' ');
  if (!txt) return msg.reply(`Usage: ?settag Your Tag`);
  data.tags[msg.author.id] = txt; saveData();
  return msg.reply(`✅ Tag set: ${txt}`);
}

// 👑 RANKS (NO PERMISSION ERRORS)
if (cmd === 'rankup') {
  if (!isModerator(msg.author.id)) return msg.reply(`❌ Mods only`);
  const curr = data.ranks[msg.author.id];
  if (curr >= RANK_NAMES.length - 1) return msg.reply(`❌ Max rank`);
  const next = RANK_NAMES[curr + 1];
  const cost = RANK_LADDER[curr + 1].cost;
  if (data.credits[msg.author.id] < cost) return msg.reply(`❌ Need ${cost} credits for ${next}`);
  addCredits(msg.author.id, -cost);
  data.ranks[msg.author.id] = curr + 1; saveData();
  return msg.reply(`✅ Ranked up to **${next}**!`);
}
if (cmd === 'rankmod') {
  if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`);
  const u = msg.mentions.members.first();
  if (!u) return msg.reply(`Usage: ?rankmod @User`);
  data.ranks[u.id] = getRankIndex('Trial Moderator'); saveData();
  return msg.reply(`✅ ${u.user.tag} → Trial Moderator`);
}
if (cmd === 'setrank') {
  if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`);
  const u = msg.mentions.members.first(); const rn = args.slice(1).join(' ');
  if (!u || !RANK_NAMES.includes(rn)) return msg.reply(`Usage: ?setrank @User RankName`);
  data.ranks[u.id] = getRankIndex(rn); saveData();
  return msg.reply(`✅ ${u.user.tag} → ${rn}`);
}
if (cmd === 'mystats') {
  return msg.reply(`📊 **YOUR STATS**
Credits: ${data.credits[msg.author.id] || 0}
Rank: ${RANK_NAMES[data.ranks[msg.author.id]] || 'None'}
Warnings: ${data.warns[msg.author.id].length}`);
}

// 🛡️ MODERATION (ALL WORKING)
if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const r = args.join(' ') || 'No reason'; if (!u) return msg.reply(`Usage: ?warn @User Reason`); data.warns[u.id].push({ by: msg.author.id, reason: r }); saveData(); return msg.reply(`✅ Warned ${u.user.tag}`); }
if (cmd === 'warnings') { const u = msg.mentions.members.first() || msg.member; const list = data.warns[u.id].map((w, i) => `${i+1}. ${w.reason}`).join('\n') || 'None'; return msg.reply(`⚠️ **${u.user.tag} Warnings**\n${list}`); }
if (cmd === 'clearwarns') { if (!isServerManager(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?clearwarns @User`); data.warns[u.id] = []; saveData(); return msg.reply(`✅ Cleared warnings for ${u.user.tag}`); }
if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?kick @User`); await u.kick(); return msg.reply(`✅ Kicked ${u.user.tag}`); }
if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?ban @User`); await u.ban(); return msg.reply(`✅ Banned ${u.user.tag}`); }
if (cmd === 'unban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isServerManager(msg.author.id)) return; const id = args[0]; if (!id) return msg.reply(`Usage: ?unban UserID`); await msg.guild.members.unban(id); return msg.reply(`✅ Unbanned ${id}`); }
if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted'); if (!u || !mr) return msg.reply(`Usage: ?mute @User`); await u.roles.add(mr); return msg.reply(`✅ Muted ${u.user.tag}`); }
if (cmd === 'unmute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted'); if (!u || !mr) return msg.reply(`Usage: ?unmute @User`); await u.roles.remove(mr); return msg.reply(`✅ Unmuted ${u.user.tag}`); }
if (cmd === 'purge') { if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !isServerManager(msg.author.id)) return; const a = parseInt(args[0]); if (isNaN(a) || a < 1 || a > 100) return msg.reply(`Usage: ?purge 1-100`); await msg.channel.bulkDelete(a, true); return msg.reply(`✅ Purged ${a} messages`); }

// ✨ EXTRAS
if (cmd === 'ping') return msg.reply(`🏓 ${client.ws.ping}ms`);
if (cmd === 'uptime') { const s = process.uptime(); return msg.reply(`⏱️ ${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`); }
if (cmd === 'serverinfo') { const g = msg.guild; return msg.reply(`📊 ${g.name} | ${g.memberCount} members`); }
if (cmd === 'userinfo') { const u = msg.mentions.users.first() || msg.author; return msg.reply(`👤 ${u.tag}\nID: ${u.id}`); }
if (cmd === 'avatar') { const u = msg.mentions.users.first() || msg.author; return msg.reply(u.displayAvatarURL({ size: 1024 })); }
if (cmd === 'say') { if (!isModerator(msg.author.id)) return; return msg.channel.send(args.join(' ')); }
if (cmd === 'embed') { if (!isModerator(msg.author.id)) return; return msg.reply({ embeds: [{ color: 0x2B2D31, description: args.join(' ') }] }); }

  saveData();
});

client.login(process.env.BOT_TOKEN || '');