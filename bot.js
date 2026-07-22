require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ✅ PERMANENT DATA (NEVER RESETS)
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
const TRAINING_Q_REWARD = 15;    // Regular questions
const TRAINING_EX_REWARD = 30;   // Scenario/Examples
const TRAINING_COOLDOWN = 24 * 60 * 60 * 1000;
const BOT_OWNER_ID = '1222684836091658330'; // YOUR ID = FULL ACCESS

// 📜 RULES (PLAIN TEXT — NO PINGS)
const TRAINING_RULES = `RULE BOOK!
1. NSFW → 1 day Timeout
2. Spam → 60 second timeout
3. Illegal politics/N@z!s → 1 day timeout
4. Swearing only if you have Swear Pass role
5. Racism → 5 minute timeout
6. Bullying/Discrimination → 1 hour timeout
7. Raiding → Permanent ban
8. Be friendly
9. No sharing/asking private info
10. Immune to Rules role has special permissions`;

// 📚 REGULAR TRAINING QUESTIONS
const TRAINING_QUESTIONS = [
  { q: "Punishment for NSFW content?", a: "1 day timeout" },
  { q: "What happens if you spam?", a: "60 second timeout" },
  { q: "Penalty for illegal politics/N@z!s?", a: "1 day timeout" },
  { q: "When is swearing allowed?", a: "only with Swear Pass role" },
  { q: "Penalty for racism?", a: "5 minute timeout" },
  { q: "Penalty for bullying/discrimination?", a: "1 hour timeout" },
  { q: "What is the punishment for raiding?", a: "permanent ban" },
  { q: "What is rule #8?", a: "be friendly" },
  { q: "What is the rule about private info?", a: "don't share or ask for private information" }
];

// 📝 SCENARIO EXAMPLES WITH OPTIONS
const TRAINING_EXAMPLES = [
  {
    q: "Scenario: A user posts explicit NSFW images in chat. What do you do?",
    options: ["A. 5 minute timeout", "B. 1 day timeout", "C. Permanent ban", "D. Warn only"],
    correct: "B",
    answer: "1 day timeout"
  },
  {
    q: "Scenario: Someone spams 10+ messages quickly. What is the punishment?",
    options: ["A. 1 hour timeout", "B. 1 day timeout", "C. 60 second timeout", "D. Kick"],
    correct: "C",
    answer: "60 second timeout"
  },
  {
    q: "Scenario: A user shares private personal info of another member. What applies?",
    options: ["A. Warn/Remove content", "B. 1 day timeout", "C. Ban", "D. Mute"],
    correct: "A",
    answer: "Warn, remove content, no specified timeout (rule #9)"
  },
  {
    q: "Scenario: A user bullies and insults others repeatedly. What is the penalty?",
    options: ["A. 5 minute timeout", "B. 1 hour timeout", "C. 1 day timeout", "D. Ban"],
    correct: "B",
    answer: "1 hour timeout"
  },
  {
    q: "Scenario: Someone raids with mass invites/mentions. What action?",
    options: ["A. 1 day timeout", "B. Kick", "C. Permanent ban", "D. Warn"],
    correct: "C",
    answer: "permanent ban"
  },
  {
    q: "Scenario: A user makes racist comments/slurs. What is the punishment?",
    options: ["A. 5 minute timeout", "B. 1 hour timeout", "C. Warn", "D. Kick"],
    correct: "A",
    answer: "5 minute timeout"
  },
  {
    q: "Scenario: Someone promotes illegal political groups/N@z!s. What happens?",
    options: ["A. Warn", "B. 60s timeout", "C. 1 day timeout", "D. Ban"],
    correct: "C",
    answer: "1 day timeout"
  },
  {
    q: "Scenario: A user without permission swears constantly. What applies?",
    options: ["A. Warn/Stop", "B. 5 min timeout", "C. 1 day timeout", "D. Kick"],
    correct: "A",
    answer: "Warn and tell them to stop / no Swear Pass role"
  },
  {
    q: "Scenario: You see someone being friendly and following all rules. What do you do?",
    options: ["A. Nothing/Encourage", "B. Mute", "C. Warn", "D. Kick"],
    correct: "A",
    answer: "Encourage them / they are following rule #8"
  }
];

// 👑 RANKS
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

// 🛒 SHOP
const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', price: 100 },
  { id: 'color_role', name: 'Color Role', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', price: 400 },
  { id: 'glory_role', name: 'Glory Role', price: 800 },
  { id: 'badge', name: 'Badge', price: 900 },
  { id: 'profile_bg', name: 'Profile Background', price: 500 },
  { id: 'signature', name: 'Signature', price: 200 }
];

// 💾 DATA SYSTEM
function loadData() {
  const defaultData = { credits: {}, warns: {}, tags: {}, ranks: {}, lastDailyClaim: {}, inventory: {}, trainingCooldowns: {} };
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return { ...defaultData, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) { return defaultData; }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

// 🛡️ HELPERS
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

// ✅ READY
client.once('ready', () => console.log(`✅ ONLINE — 2 TRAINING MODES • OPTIONS • OLD FORMAT`));

// 📨 COMMAND HANDLER
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  ensureUser(msg.author.id);
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

// 📚 EXACT OLD HELP FORMAT
if (cmd === 'help') {
  return msg.reply(`Prefix: ${PREFIX}
📈 ECONOMY: ?claim, ?addcredits, ?removecredits, ?balance, ?richlist
🛒 SHOP & PROFILE: ?shop, ?buy, ?profile, ?roster, ?settag
👑 RANKS: ?rankup, ?rankmod, ?setrank, ?mystats
🛡️ MODERATION: ?warn, ?warnings, ?clearwarns, ?kick, ?ban, ?unban, ?mute, ?unmute, ?purge
✨ EXTRAS: ?ping, ?uptime, ?serverinfo, ?userinfo, ?avatar, ?say, ?embed
🎓 TRAINING: ?training, ?trainingexamples, ?trainingrules`);
}

// 📜 RULES
if (cmd === 'trainingrules') return msg.reply(TRAINING_RULES);

// 🎓 REGULAR TRAINING (15 CREDITS)
if (cmd === 'training') {
  const lastRun = data.trainingCooldowns[msg.author.id] || 0;
  if (Date.now() - lastRun < TRAINING_COOLDOWN) {
    const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
    return msg.reply(`❌ Cooldown: ${h}h left`);
  }
  await msg.reply(`${TRAINING_RULES}\n\nTRAINING STARTED! +${TRAINING_Q_REWARD} credits per correct answer.`);
  data.trainingCooldowns[msg.author.id] = Date.now();
  saveData();

  for (let i = 0; i < TRAINING_QUESTIONS.length; i++) {
    const q = TRAINING_QUESTIONS[i];
    await msg.channel.send(`Q${i+1}/9: ${q.q}`);
    const collected = await msg.channel.awaitMessages({ filter: m => !m.author.bot, max:1, time:30000 });
    if (!collected.size) { await msg.channel.send(`⏱️ Answer: ${q.a}`); continue; }
    const m = collected.first();
    // ✅ Accept any spacing/case
    const userAns = m.content.toLowerCase().replace(/\s+/g, '');
    const correctAns = q.a.toLowerCase().replace(/\s+/g, '');
    if (userAns.includes(correctAns) || correctAns.includes(userAns)) {
      addCredits(m.author.id, TRAINING_Q_REWARD);
      await msg.channel.send(`✅ +${TRAINING_Q_REWARD} credits → ${m.author.tag}`);
    } else {
      await msg.channel.send(`❌ Correct: ${q.a}`);
    }
  }
  return msg.channel.send(`TRAINING COMPLETE!`);
}

// 📝 EXAMPLES/SCENARIOS WITH OPTIONS (30 CREDITS)
if (cmd === 'trainingexamples') {
  const lastRun = data.trainingCooldowns[msg.author.id] || 0;
  if (Date.now() - lastRun < TRAINING_COOLDOWN) {
    const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
    return msg.reply(`❌ Cooldown: ${h}h left`);
  }
  await msg.reply(`${TRAINING_RULES}\n\nSCENARIO TRAINING STARTED! Pick A/B/C/D. +${TRAINING_EX_REWARD} credits each!`);
  data.trainingCooldowns[msg.author.id] = Date.now();
  saveData();

  for (let i = 0; i < TRAINING_EXAMPLES.length; i++) {
    const ex = TRAINING_EXAMPLES[i];
    await msg.channel.send(`EXAMPLE ${i+1}/9: ${ex.q}\n${ex.options.join('\n')}`);
    const collected = await msg.channel.awaitMessages({ filter: m => !m.author.bot, max:1, time:45000 });
    if (!collected.size) { await msg.channel.send(`⏱️ Correct: **${ex.correct}** → ${ex.answer}`); continue; }
    const m = collected.first();
    const userPick = m.content.toUpperCase().trim();
    if (userPick === ex.correct) {
      addCredits(m.author.id, TRAINING_EX_REWARD);
      await msg.channel.send(`✅ PERFECT! +${TRAINING_EX_REWARD} credits → ${m.author.tag}`);
    } else {
      await msg.channel.send(`❌ Wrong! Correct: **${ex.correct}** → ${ex.answer}`);
    }
  }
  return msg.channel.send(`SCENARIO TRAINING COMPLETE!`);
}

// 💰 ECONOMY
if (cmd === 'claim') {
  if (!isModerator(msg.author.id)) return msg.reply(`❌ Mods only`);
  const today = new Date().toDateString();
  if (data.lastDailyClaim === today) return msg.reply(`❌ Already claimed today`);
  data.lastDailyClaim = today;
  addCredits(msg.author.id, DAILY_REWARD);
  return msg.reply(`✅ Claimed ${DAILY_REWARD} credits!`);
}
if (cmd === 'addcredits') { if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`); const u = msg.mentions.members.first(); const a = +args[0]; if (!u||!a||a<=0) return msg.reply(`Usage: ?addcredits @User 100`); addCredits(u.id,a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'removecredits') { if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`); const u = msg.mentions.members.first(); const a = +args[0]; if (!u||!a||a<=0) return msg.reply(`Usage: ?removecredits @User 50`); if (data.credits[u.id]<a) return msg.reply(`❌ Only ${data.credits[u.id]}`); addCredits(u.id,-a); return msg.reply(`✅ ${u.user.tag}: ${data.credits[u.id]}`); }
if (cmd === 'balance'||cmd==='bal') { const t = msg.mentions.members.first()||msg.member; return msg.reply(`💰 ${t.user.tag}: ${data.credits[t.id]||0}`); }
if (cmd === 'richlist') { const sorted = Object.entries(data.credits).sort((a,b)=>b[1]-a[1]).slice(0,10); const list = sorted.map(([id,c],i)=>`#${i+1} <@${id}> — ${c} credits`).join('\n')||'No data'; return msg.reply(`💎 Top 10 Richest\n${list}`); }

// 🛒 SHOP
if (cmd === 'shop') { const list = SHOP.map(x=>`${x.id}: ${x.name} — ${x.price} credits`).join('\n'); return msg.reply(`🛒 SHOP\n\n${list}\n\nBuy with: ?buy <item-id>`); }
if (cmd === 'buy') { const item = SHOP.find(x=>x.id===args[0]?.toLowerCase()); if (!item) return msg.reply(`❌ Invalid item — check ?shop`); if (data.credits[msg.author.id]<item.price) return msg.reply(`❌ Not enough credits! Need ${item.price}`); addCredits(msg.author.id,-item.price); data.inventory[msg.author.id].push(item); saveData(); return msg.reply(`✅ Bought ${item.name} —${item.price} credits`); }

// 👤 PROFILE / ROSTER / SETTAG
if (cmd === 'profile') { const u = msg.mentions.members.first()||msg.member; ensureUser(u.id); const inv = data.inventory[u.id].map(x=>x.name).join(', ')||'Empty'; return msg.reply(`👤 ${u.user.tag}\nRank: ${RANK_NAMES[data.ranks[u.id]]||'None'}\nCredits: ${data.credits[u.id]||0}\nInventory: ${inv}`); }
if (cmd === 'roster') { let out = ''; for (const [id,ri] of Object.entries(data.ranks)) { if (ri<0) continue; const m = await msg.guild.members.fetch(id).catch(()=>null); if (m) out += `${RANK_NAMES[ri]}: ${m.user.tag}\n`; } return msg.reply(`📋 ROSTER\n${out||'No mods found'}`); }
if (cmd === 'settag') { const txt = args.join(' '); if (!txt) return msg.reply(`Usage: ?settag Your Tag`); data.tags[msg.author.id]=txt; saveData(); return msg.reply(`✅ Tag set: ${txt}`); }

// 👑 RANKS
if (cmd === 'rankup') { if (!isModerator(msg.author.id)) return msg.reply(`❌ Mods only`); const curr = data.ranks[msg.author.id]; if (curr>=RANK_NAMES.length-1) return msg.reply(`❌ Max rank`); const next = RANK_NAMES[curr+1]; const cost = RANK_LADDER[curr+1].cost; if (data.credits[msg.author.id]<cost) return msg.reply(`❌ Need ${cost} credits for ${next}`); addCredits(msg.author.id,-cost); data.ranks[msg.author.id]=curr+1; saveData(); return msg.reply(`✅ Ranked up to ${next}!`); }
if (cmd === 'rankmod') { if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`); const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?rankmod @User`); data.ranks[u.id]=getRankIndex('Trial Moderator'); saveData(); return msg.reply(`✅ ${u.user.tag} → Trial Moderator`); }
if (cmd === 'setrank') { if (!isServerManager(msg.author.id)) return msg.reply(`❌ Manager only`); const u = msg.mentions.members.first(); const rn = args.slice(1).join(' '); if (!u||!RANK_NAMES.includes(rn)) return msg.reply(`Usage: ?setrank @User RankName`); data.ranks[u.id]=getRankIndex(rn); saveData(); return msg.reply(`✅ ${u.user.tag} → ${rn}`); }
if (cmd === 'mystats') { return msg.reply(`📊 YOUR STATS\nCredits: ${data.credits[msg.author.id]||0}\nRank: ${RANK_NAMES[data.ranks[msg.author.id]]||'None'}\nWarnings: ${data.warns[msg.author.id].length}`); }

// 🛡️ MODERATION
if (cmd === 'warn') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const r = args.join(' ')||'No reason'; if (!u) return msg.reply(`Usage: ?warn @User Reason`); data.warns[u.id].push({by:msg.author.id,reason:r}); saveData(); return msg.reply(`✅ Warned ${u.user.tag}`); }
if (cmd === 'warnings') { const u = msg.mentions.members.first()||msg.member; const list = data.warns[u.id].map((w,i)=>`${i+1}. ${w.reason}`).join('\n')||'None'; return msg.reply(`⚠️ ${u.user.tag} Warnings\n${list}`); }
if (cmd === 'clearwarns') { if (!isServerManager(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?clearwarns @User`); data.warns[u.id]=[]; saveData(); return msg.reply(`✅ Cleared warnings for ${u.user.tag}`); }
if (cmd === 'kick') { if (!msg.member.permissions.has(PermissionsBitField.Flags.KickMembers) && !isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?kick @User`); await u.kick(); return msg.reply(`✅ Kicked ${u.user.tag}`); }
if (cmd === 'ban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); if (!u) return msg.reply(`Usage: ?ban @User`); await u.ban(); return msg.reply(`✅ Banned ${u.user.tag}`); }
if (cmd === 'unban') { if (!msg.member.permissions.has(PermissionsBitField.Flags.BanMembers) && !isServerManager(msg.author.id)) return; const id = args[0]; if (!id) return msg.reply(`Usage: ?unban UserID`); await msg.guild.members.unban(id); return msg.reply(`✅ Unbanned ${id}`); }
if (cmd === 'mute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r=>r.name.toLowerCase()==='muted'); if (!u||!mr) return msg.reply(`Usage: ?mute @User`); await u.roles.add(mr); return msg.reply(`✅ Muted ${u.user.tag}`); }
if (cmd === 'unmute') { if (!isModerator(msg.author.id)) return; const u = msg.mentions.members.first(); const mr = msg.guild.roles.cache.find(r=>r.name.toLowerCase()==='muted'); if (!u||!mr) return msg.reply(`Usage: ?unmute @User`); await u.roles.remove(mr); return msg.reply(`✅ Unmuted ${u.user.tag}`); }
if (cmd === 'purge') { if (!msg.member.permissions.has(PermissionsBitField.Flags.ManageMessages) && !isServerManager(msg.author.id)) return; const a = parseInt(args[0]); if (isNaN(a)||a<1||a>100) return msg.reply(`Usage: ?purge 1-100`); await msg.channel.bulkDelete(a,true); return msg.reply(`✅ Purged ${a} messages`); }

// ✨ EXTRAS
if (cmd === 'ping') return msg.reply(`🏓 ${client.ws.ping}ms`);
if (cmd === 'uptime') { const s = process.uptime(); return msg.reply(`⏱️ ${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`); }
if (cmd === 'serverinfo') { const g = msg.guild; return msg.reply(`📊 ${g.name} | ${g.memberCount} members`); }
if (cmd === 'userinfo') { const u = msg.mentions.users.first()||msg.author; return msg.reply(`👤 ${u.tag}\nID: ${u.id}`); }
if (cmd === 'avatar') { const u = msg.mentions.users.first()||msg.author; return msg.reply(u.displayAvatarURL({size:1024})); }
if (cmd === 'say') { if (!isModerator(msg.author.id)) return; return msg.channel.send(args.join(' ')); }
if (cmd === 'embed') { if (!isModerator(msg.author.id)) return; return msg.reply({embeds:[{color:0x2B2D31,description:args.join(' ')}]}); }

  saveData();
});

client.login(process.env.BOT_TOKEN || '');