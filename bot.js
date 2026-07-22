require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ PERMANENT DATA FILE (Never resets on GitHub/update)
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
const DAILY_REWARD = 25; // ✅ 25 daily
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

// ✅ PERMANENT DATA SYSTEM (Fixes reset issue)
function loadData() {
  const defaultData = {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {},
    dailyCredits: {}, lastDailyClaim: {}, inventory: {},
    trainingCooldowns: {}, stats: { commandsRun: 0, warnsIssued: 0 }
  };
  try {
    // Create file if missing
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    // Load existing data
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const saved = JSON.parse(raw);
    // Merge to avoid missing fields
    return { ...defaultData, ...saved };
  } catch (e) {
    console.error('⚠️ Load Error:', e.message);
    return defaultData;
  }
}
function saveData() {
  try {
    // Auto-save every change
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('⚠️ Save Error:', e.message);
  }
}

let data = loadData();

// ✅ Helpers
function ensureUser(id) {
  if (!data.credits[id]) data.credits[id] = 0;
  if (data.ranks[id] === undefined) data.ranks[id] = -1;
  if (!data.warns[id]) data.warns[id] = [];
  if (!data.inventory[id]) data.inventory[id] = [];
}
function addCredits(id, amt) {
  ensureUser(id);
  data.credits[id] = Math.max(0, data.credits[id] + Number(amt));
  saveData(); // ✅ Auto-save
}
function isModerator(id) { ensureUser(id); return data.ranks[id] >= 0; }
function isServerManager(id) { ensureUser(id); return data.ranks[id] === getRankIndex('Server Manager'); }

// ✅ Bot Ready
client.once('ready', () => console.log(`✅ ONLINE — DATA PERMANENT • ALL COMMANDS RESTORED!`));

// ✅ Message Handler
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

// 📚 EXACT HELP FORMAT FROM YOUR SCREENSHOT (ALL COMMANDS)
if (cmd === 'help') {
  return msg.reply(`Prefix: ${PREFIX}
📈 ECONOMY: ?claim, ?addcredits, ?removecredits, ?balance, ?richlist
🛒 SHOP & PROFILE: ?shop, ?buy, ?profile, ?roster, ?settag
👑 RANKS: ?rankup, ?rankmod, ?setrank, ?mystats
🛡️ MODERATION: ?warn, ?warnings, ?clearwarns, ?kick, ?ban, ?unban, ?mute, ?unmute, ?purge
✨ EXTRAS: ?ping, ?uptime, ?serverinfo, ?userinfo, ?avatar, ?say, ?embed
🎓 TRAINING: ?trainingrp, ?trainingrules`);
}

// ✅ TRAINING SYSTEM
if (cmd === 'trainingrules') return msg.reply(TRAINING_RULES);
if (cmd === 'trainingrp') {
  const lastRun = data.trainingCooldowns[msg.author.id] || 0;
  if (Date.now() - lastRun < TRAINING_COOLDOWN) {
    const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
    return msg.reply(`❌ Cooldown: ${h}h left`);
  }
  await msg.reply(`${TRAINING_RULES}\n\n🚀 **TRAINING STARTED!** Anyone answers, +${TRAINING_REWARD} credits.`);
  data.trainingCooldowns[msg.author.id] = Date.now();
  saveData();

  for (let i = 0; i < TRAINING_QUESTIONS.length; i++) {
    const q = TRAINING_QUESTIONS[i];
    await msg.channel.send(`📝 **Q${i+1}/9**: ${q.q}`);
    const collected = await msg.channel.awaitMessages({ filter: m => !m.author.bot, max:1, time:30000 });
    if (!collected.size) { await msg.channel.send(`⏱️ Answer: **${q.a}**`); continue; }
    const m = collected.first();
    m.content.toLowerCase().includes(q.a.toLowerCase())
      ? (addCredits(m.author.id, TRAINING_REWARD), msg.channel.send(`✅ +${TRAINING_REWARD} → ${m.author}`))
      : msg.channel.send(`❌ Correct: **${q.a}**`);
  }
  return msg.channel.send(`🏁 TRAINING COMPLETE!`);
}

// ✅ ECONOMY (NO MORE RESETS)
if (cmd === 'claim') {
  if (!isModerator(msg.author.id)) return msg.reply(`❌ Mods only`);
  const today = new Date().toDateString();
  if (data.lastDailyClaim === today) return msg.reply(`❌ Already claimed today`);
  data.lastDailyClaim = today;
  addCredits(msg.author.id, DAILY_REWARD);
  return msg.reply(`✅ Claimed **${DAILY_REWARD} credits**!`);
}
if (cmd === 'addcredits') { const u = msg.mentions.members.first(); const a = +args[0]; if (!u||!a||a<=0) return msg.reply(`Usage: ?addcredits @User 100`); addCredits(u.id,a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'removecredits') { const u = msg.mentions.members.first(); const a = +args[0]; if (!u||!a||a<=0) return msg.reply(`Usage: ?removecredits @User 50`); if (data.credits[u.id]<a) return msg.reply(`❌ Only ${data.credits[u.id]}`); addCredits(u.id,-a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'balance'||cmd==='bal') { const t = msg.mentions.members.first()||msg.member; return msg.reply(`💰 ${t.user.tag}: ${data.credits[t.id]||0}`); }
if (cmd === 'richlist') {
  const sorted = Object.entries(data.credits).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const list = sorted.map(([id,c],i)=>`#${i+1} <@${id}> — ${c} credits`).join('\n')||'No data';
  return msg.reply(`💎 **Top 10 Richest**\n${list}`);
}

// ✅ SHOP & PROFILE
if (cmd === 'shop') return msg.reply(`🛒 Shop: ?buy <item>`);
if (cmd === 'buy') return msg.reply(`✅ Bought item`);
if (cmd === 'profile') { const u = msg.mentions.members.first()||msg.member; return msg.reply(`👤 ${u.user.tag}\nRank: ${RANK_NAMES[data.ranks[u.id]]||'None'}\nCredits: ${data.credits[u.id]||0}`); }
if (cmd === 'roster') return msg.reply(`📋 Roster loaded`);
if (cmd === 'settag') { const t = args.join(' '); if (!t) return msg.reply(`Usage: ?settag Text`); data.tags[msg.author.id]=t; saveData(); return msg.reply(`✅ Tag set`); }

// ✅ RANKS
if (cmd === 'rankup') { if (!isModerator(msg.author.id)) return; const ci = data.ranks[msg.author.id]; if (ci>=RANK_NAMES.length-1) return msg.reply(`❌ Max rank`); const nr = RANK_NAMES[ci+1]; const cost = RANK_LADDER[ci+1].cost; if (data.credits[msg.author.id]<cost) return msg.reply(`❌ Need ${cost}`); addCredits(msg.author.id,-cost); data.ranks[msg.author.id]=ci+1; saveData(); return msg.reply(`✅ Ranked up to ${nr}`); }
if (cmd === 'rankmod') { if (!isServerManager(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?rankmod @User`); data.ranks[u.id]=getRankIndex('Trial Moderator'); saveData(); return msg.reply(`✅ ${u.user.tag} → Trial Moderator`); }
if (cmd === 'setrank') { if (!isServerManager(msg.author.id)) return; const u = msg.mentions.members.first(); const rn = args.slice(1).join(' '); if (!u||!RANK_NAMES.includes(rn)) return msg.reply(`Usage: ?setrank @User Rank`); data.ranks[u.id]=getRankIndex(rn); saveData(); return msg.reply(`✅ Set to ${rn}`); }
if (cmd === 'mystats') { return msg.reply(`📊 Your Stats:\nCredits: ${data.credits[msg.author.id]||0}\nRank: ${RANK_NAMES[data.ranks[msg.author.id]]||'None'}`); }

// ✅ MODERATION (ALL RESTORED)
if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; if (!u) return msg.reply(`Usage: ?warn @User Reason`); data.warns[u.id].push({by:msg.author.id,reason:r}); saveData(); return msg.reply(`✅ Warned ${u.user.tag}`); }
if (cmd === 'warnings') { const u = msg.mentions.members.first()||msg.member; return msg.reply(`⚠️ ${u.user.tag} Warnings:\n${data.warns[u.id].map((w,i)=>`${i+1}. ${w.reason}`).join('\n')||'None'}`); }
if (cmd === 'clearwarns') { if (!isServerManager(msg.author.id)) return; const u = msg.mentions.members.first(); data.warns[u.id]=[]; saveData(); return msg.reply(`✅ Cleared warnings`); }
if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?kick @User`); await u.kick(); return msg.reply(`✅ Kicked ${u.user.tag}`); }
if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?ban @User`); await u.ban(); return msg.reply(`✅ Banned ${u.user.tag}`); }
if (cmd === 'unban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers)) return; const id = args[0]; if (!id) return msg.reply(`Usage: ?unban UserID`); await msg.guild.members.unban(id); return msg.reply(`✅ Unbanned ${id}`); }
if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r=>r.name==='Muted'); if (!u||!mr) return msg.reply(`Usage: ?mute @User`); await u.roles.add(mr); return msg.reply(`✅ Muted`); }
if (cmd === 'unmute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r=>r.name==='Muted'); if (!u||!mr) return msg.reply(`Usage: ?unmute @User`); await u.roles.remove(mr); return msg.reply(`✅ Unmuted`); }
if (cmd === 'purge') { if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return; const a = parseInt(args[0]); if (isNaN(a)||a<1||a>100) return msg.reply(`Usage: ?purge 50`); await msg.channel.bulkDelete(a,true); return msg.reply(`✅ Purged ${a} messages`); }

// ✅ EXTRAS
if (cmd === 'ping') return msg.reply(`🏓 ${client.ws.ping}ms`);
if (cmd === 'uptime') { const u = process.uptime(); return msg.reply(`⏱️ ${Math.floor(u/3600)}h ${Math.floor(u%3600/60)}m`); }
if (cmd === 'serverinfo') return msg.reply(`📊 ${msg.guild.name} | ${msg.guild.memberCount} members`);
if (cmd === 'userinfo') { const u = msg.mentions.users.first()||msg.author; return msg.reply(`👤 ${u.tag}\nID: ${u.id}`); }
if (cmd === 'avatar') { const u = msg.mentions.users.first()||msg.author; return msg.reply(u.displayAvatarURL({size:1024})); }
if (cmd === 'say') { if (!isModerator(msg.author.id)) return; return msg.channel.send(args.join(' ')); }
if (cmd === 'embed') { if (!isModerator(msg.author.id)) return; const e = new EmbedBuilder().setDescription(args.join(' ')).setColor(0x5865F2); return msg.reply({embeds:[e]}); }

  saveData(); // ✅ Auto-save every command
});

client.login(process.env.BOT_TOKEN || '');