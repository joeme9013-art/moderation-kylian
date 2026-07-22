require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.resolve('./data.json');
const PREFIX = '?'; // kept for fallback, but slash is primary
const DAILY_REWARD = 25;
const TRAINING_Q_REWARD = 15;
const TRAINING_EX_REWARD = 30;
const TRAINING_COOLDOWN = 24 * 60 * 60 * 1000;
const BOT_OWNER_ID = '1222684836091658330';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages, // ✅ Enable DMs
  ],
  partials: ['CHANNEL'] // ✅ Required for DMs
});

// ─────────────────────────────────────────────────────────────
// EXACT HELP TEXT FORMAT — NO DEVIATION
// ─────────────────────────────────────────────────────────────
const HELP_TEXT = `Prefix: ${PREFIX}

ECONOMY: claim, addcredits, removecredits, balance, richlist
SHOP & PROFILE: shop, buy, profile, roster, settag
RANKS: rankup, rankmod, setrank, mystats
MODERATION: warn, warnings, clearwarns, kick, ban, unban, mute, unmute, purge
EXTRAS: ping, uptime, serverinfo, userinfo, avatar, say, embed
TRAINING:
  training
  trainingexamples
trainingrules

Type /help command for more info on a command.`;

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

const TRAINING_EXAMPLES = [
  { q: "Scenario: A user posts explicit NSFW images in chat. What do you do?", options: ["A. 5 minute timeout", "B. 1 day timeout", "C. Permanent ban", "D. Warn only"], correct: "B", answer: "1 day timeout" },
  { q: "Scenario: Someone spams 10+ messages quickly. What is the punishment?", options: ["A. 1 hour timeout", "B. 1 day timeout", "C. 60 second timeout", "D. Kick"], correct: "C", answer: "60 second timeout" },
  { q: "Scenario: A user shares private personal info of another member. What applies?", options: ["A. Warn/Remove content", "B. 1 day timeout", "C. Ban", "D. Mute"], correct: "A", answer: "Warn, remove content" },
  { q: "Scenario: A user bullies and insults others repeatedly. What is the penalty?", options: ["A. 5 minute timeout", "B. 1 hour timeout", "C. 1 day timeout", "D. Ban"], correct: "B", answer: "1 hour timeout" },
  { q: "Scenario: Someone raids with mass invites/mentions. What action?", options: ["A. 1 day timeout", "B. Kick", "C. Permanent ban", "D. Warn"], correct: "C", answer: "permanent ban" },
  { q: "Scenario: A user makes racist comments/slurs. What is the punishment?", options: ["A. 5 minute timeout", "B. 1 hour timeout", "C. Warn", "D. Kick"], correct: "A", answer: "5 minute timeout" },
  { q: "Scenario: Someone promotes illegal political groups/N@z!s. What happens?", options: ["A. Warn", "B. 60s timeout", "C. 1 day timeout", "D. Ban"], correct: "C", answer: "1 day timeout" },
  { q: "Scenario: A user without permission swears constantly. What applies?", options: ["A. Warn/Stop", "B. 5 min timeout", "C. 1 day timeout", "D. Kick"], correct: "A", answer: "Warn and tell them to stop" },
  { q: "Scenario: You see someone being friendly and following all rules. What do you do?", options: ["A. Nothing/Encourage", "B. Mute", "C. Warn", "D. Kick"], correct: "A", answer: "Encourage them" }
];

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

const SHOP = [
  { id: 'custom_tag', name: 'Custom Tag', price: 100 },
  { id: 'color_role', name: 'Color Role', price: 250 },
  { id: 'vip_badge', name: 'VIP Badge', price: 400 },
  { id: 'glory_role', name: 'Glory Role', price: 800 },
  { id: 'badge', name: 'Badge', price: 900 },
  { id: 'profile_bg', name: 'Profile Background', price: 500 },
  { id: 'signature', name: 'Signature', price: 200 }
];

// ─────────────────────────────────────────────────────────────
// DATA HELPERS
// ─────────────────────────────────────────────────────────────
function loadData() {
  const defaultData = { credits: {}, warns: {}, tags: {}, ranks: {}, lastDailyClaim: {}, inventory: {}, trainingCooldowns: {} };
  try {
    if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return { ...defaultData, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) { return defaultData; }
}
function saveData() { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

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

// ─────────────────────────────────────────────────────────────
// SLASH COMMAND DEFINITIONS
// ─────────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Shows all commands'),
  new SlashCommandBuilder().setName('training').setDescription('Start moderator training'),
  new SlashCommandBuilder().setName('trainingexamples').setDescription('Start scenario training'),
  new SlashCommandBuilder().setName('trainingrules').setDescription('Show training rules'),
  new SlashCommandBuilder().setName('claim').setDescription('Claim daily credits'),
  new SlashCommandBuilder().setName('addcredits').setDescription('Add credits to user')
    .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('removecredits').setDescription('Remove credits from user')
    .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    .addIntegerOption(o=>o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder().setName('balance').setDescription('Check balance')
    .addUserOption(o=>o.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('richlist').setDescription('Top richest users'),
  new SlashCommandBuilder().setName('shop').setDescription('View shop'),
  new SlashCommandBuilder().setName('buy').setDescription('Buy item')
    .addStringOption(o=>o.setName('item').setDescription('Item ID').setRequired(true)),
  new SlashCommandBuilder().setName('profile').setDescription('View profile')
    .addUserOption(o=>o.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('roster').setDescription('View moderator roster'),
  new SlashCommandBuilder().setName('settag').setDescription('Set your profile tag')
    .addStringOption(o=>o.setName('tag').setDescription('Tag text').setRequired(true)),
  new SlashCommandBuilder().setName('rankup').setDescription('Rank up using credits'),
  new SlashCommandBuilder().setName('rankmod').setDescription('Promote to Trial Moderator')
    .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('setrank').setDescription('Set user rank')
    .addUserOption(o=>o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o=>o.setName('rank').setDescription('Rank name').setRequired(true)),
  new SlashCommandBuilder().setName('mystats').setDescription('View your stats'),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a user')
    .addUserOption(o=>o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o=>o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder().setName('warnings').setDescription('View user warnings')
    .addUserOption(o=>o.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('clearwarns').setDescription('Clear user warnings')
    .addUserOption(o=>o.setName('user').setDescription('User').setRequired(true)),
  new SlashCommandBuilder().setName('ping').setDescription('Bot latency'),
  new SlashCommandBuilder().setName('uptime').setDescription('Bot uptime'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Server info'),
  new SlashCommandBuilder().setName('userinfo').setDescription('User info')
    .addUserOption(o=>o.setName('user').setDescription('User')),
  new SlashCommandBuilder().setName('avatar').setDescription('View avatar')
    .addUserOption(o=>o.setName('user').setDescription('User')),
];

// ─────────────────────────────────────────────────────────────
// READY & REGISTER COMMANDS
// ─────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ ONLINE — SLASH + DM SUPPORT • EXACT FORMAT`);
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  try {
    await rest.post(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Slash commands registered globally');
  } catch (e) { console.error(e); }
});

// ─────────────────────────────────────────────────────────────
// SLASH COMMAND HANDLER — WORKS IN SERVER + DM
// ─────────────────────────────────────────────────────────────
client.on('interactionCreate', async int => {
  if (!int.isChatInputCommand()) return;
  const { commandName, options, user } = int;
  ensureUser(user.id);

  try {
    // HELP — EXACT FORMAT
    if (commandName === 'help') return int.reply({ content: HELP_TEXT, ephemeral: false });

    if (commandName === 'trainingrules') return int.reply(TRAINING_RULES);

    if (commandName === 'training') {
      const lastRun = data.trainingCooldowns[user.id] || 0;
      if (Date.now() - lastRun < TRAINING_COOLDOWN) {
        const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
        return int.reply(`Cooldown: ${h}h left`);
      }
      await int.reply(`${TRAINING_RULES}\n\nTRAINING STARTED! +${TRAINING_Q_REWARD} credits each.`);
      data.trainingCooldowns[user.id] = Date.now();
      saveData();
      const ch = int.channel;
      for (let i = 0; i < TRAINING_QUESTIONS.length; i++) {
        const q = TRAINING_QUESTIONS[i];
        await ch.send(`Q${i+1}/9: ${q.q}`);
        const c = await ch.awaitMessages({ filter: m=>!m.author.bot, max:1, time:30000 });
        if (!c.size) { await ch.send(`Answer: ${q.a}`); continue; }
        const m = c.first();
        const ok = m.content.toLowerCase().replace(/\s/g,'').includes(q.a.toLowerCase().replace(/\s/g,''));
        if (ok) { addCredits(m.author.id, TRAINING_Q_REWARD); await ch.send(`+${TRAINING_Q_REWARD} → ${m.author}`); }
        else await ch.send(`Correct: ${q.a}`);
      }
      return ch.send(`TRAINING COMPLETE!`);
    }

    if (commandName === 'trainingexamples') {
      const lastRun = data.trainingCooldowns[user.id] || 0;
      if (Date.now() - lastRun < TRAINING_COOLDOWN) {
        const h = Math.ceil((TRAINING_COOLDOWN - (Date.now() - lastRun)) / 3600000);
        return int.reply(`Cooldown: ${h}h left`);
      }
      await int.reply(`${TRAINING_RULES}\n\nSCENARIO TRAINING STARTED! +${TRAINING_EX_REWARD} each!`);
      data.trainingCooldowns[user.id] = Date.now();
      saveData();
      const ch = int.channel;
      for (let i = 0; i < TRAINING_EXAMPLES.length; i++) {
        const ex = TRAINING_EXAMPLES[i];
        await ch.send(`EXAMPLE ${i+1}/9: ${ex.q}\n${ex.options.join('\n')}`);
        const c = await ch.awaitMessages({ filter: m=>!m.author.bot, max:1, time:45000 });
        if (!c.size) { await ch.send(`Correct: ${ex.correct} → ${ex.answer}`); continue; }
        const m = c.first();
        if (m.content.toUpperCase().trim() === ex.correct) { addCredits(m.author.id, TRAINING_EX_REWARD); await ch.send(`+${TRAINING_EX_REWARD} → ${m.author}`); }
        else await ch.send(`Wrong! Correct: ${ex.correct} → ${ex.answer}`);
      }
      return ch.send(`SCENARIO TRAINING COMPLETE!`);
    }

    // Economy
    if (commandName === 'claim') {
      if (!isModerator(user.id)) return int.reply(`Mods only`);
      const today = new Date().toDateString();
      if (data.lastDailyClaim === today) return int.reply(`Already claimed today`);
      data.lastDailyClaim = today; addCredits(user.id, DAILY_REWARD);
      return int.reply(`Claimed ${DAILY_REWARD} credits!`);
    }
    if (commandName === 'addcredits') { if (!isServerManager(user.id)) return int.reply(`Manager only`); const u = options.getUser('user'); const a = options.getInteger('amount'); addCredits(u.id,a); return int.reply(`${u.tag}: ${data.credits[u.id]}`); }
    if (commandName === 'removecredits') { if (!isServerManager(user.id)) return int.reply(`Manager only`); const u = options.getUser('user'); const a = options.getInteger('amount'); addCredits(u.id,-a); return int.reply(`${u.tag}: ${data.credits[u.id]}`); }
    if (commandName === 'balance') { const u = options.getUser('user')||user; ensureUser(u.id); return int.reply(`${u.tag}: ${data.credits[u.id]||0}`); }
    if (commandName === 'richlist') { const sorted = Object.entries(data.credits).sort((a,b)=>b[1]-a[1]).slice(0,10); const list = sorted.map(([id,c],i)=>`#${i+1} <@${id}> — ${c}`).join('\n')||'No data'; return int.reply(`Top 10 Richest\n${list}`); }
    if (commandName === 'shop') { const list = SHOP.map(x=>`${x.id}: ${x.name} — ${x.price} credits`).join('\n'); return int.reply(`SHOP\n\n${list}\n\nBuy with: /buy <item>`); }
    if (commandName === 'buy') { const item = SHOP.find(x=>x.id===options.getString('item')?.toLowerCase()); if (!item) return int.reply(`Invalid item`); if (data.credits[user.id]<item.price) return int.reply(`Not enough credits`); addCredits(user.id,-item.price); data.inventory[user.id].push(item); saveData(); return int.reply(`Bought ${item.name}`); }
    if (commandName === 'profile') { const u = options.getUser('user')||user; ensureUser(u.id); const inv = data.inventory[u.id].map(x=>x.name).join(', ')||'Empty'; return int.reply(`${u.tag}\nRank: ${RANK_NAMES[data.ranks[u.id]]||'None'}\nCredits: ${data.credits[u.id]||0}\nInventory: ${inv}`); }
    if (commandName === 'roster') { let out = ''; for (const [id,ri] of Object.entries(data.ranks)) { if (ri<0) continue; const m = await client.users.fetch(id).catch(()=>null); if (m) out += `${RANK_NAMES[ri]}: ${m.tag}\n`; } return int.reply(`ROSTER\n${out||'No mods found'}`); }
    if (commandName === 'settag') { data.tags[user.id] = options.getString('tag'); saveData(); return int.reply(`Tag set: ${data.tags[user.id]}`); }
    if (commandName === 'rankup') { if (!isModerator(user.id)) return int.reply(`Mods only`); const curr = data.ranks[user.id]; if (curr>=RANK_NAMES.length-1) return int.reply(`Max rank`); const next = RANK_NAMES[curr+1]; const cost = RANK_LADDER[curr+1].cost; if (data.credits[user.id]<cost) return int.reply(`Need ${cost} credits for ${next}`); addCredits(user.id,-cost); data.ranks[user.id]=curr+1; saveData(); return int.reply(`Ranked up to ${next}!`); }
    if (commandName === 'rankmod') { if (!isServerManager(user.id)) return int.reply(`Manager only`); const u = options.getUser('user'); data.ranks[u.id]=getRankIndex('Trial Moderator'); saveData(); return int.reply(`${u.tag} → Trial Moderator`); }
    if (commandName === 'setrank') { if (!isServerManager(user.id)) return int.reply(`Manager only`); const u = options.getUser('user'); const rn = options.getString('rank'); if (!RANK_NAMES.includes(rn)) return int.reply(`Invalid rank`); data.ranks[u.id]=getRankIndex(rn); saveData(); return int.reply(`${u.tag} → ${rn}`); }
    if (commandName === 'mystats') { return int.reply(`YOUR STATS\nCredits: ${data.credits[user.id]||0}\nRank: ${RANK_NAMES[data.ranks[user.id]]||'None'}\nWarnings: ${data.warns[user.id].length}`); }
    if (commandName === 'warn') { if (!isModerator(user.id)) return; const u = options.getUser('user'); const r = options.getString('reason')||'No reason'; data.warns[u.id].push({by:user.id,reason:r}); saveData(); return int.reply(`Warned ${u.tag}`); }
    if (commandName === 'warnings') { const u = options.getUser('user')||user; const list = data.warns[u.id].map((w,i)=>`${i+1}. ${w.reason}`).join('\n')||'None'; return int.reply(`${u.tag} Warnings\n${list}`); }
    if (commandName === 'clearwarns') { if (!isServerManager(user.id)) return; const u = options.getUser('user'); data.warns[u.id]=[]; saveData(); return int.reply(`Cleared warnings for ${u.tag}`); }
    if (commandName === 'ping') return int.reply(`${client.ws.ping}ms`);
    if (commandName === 'uptime') { const s = process.uptime(); return int.reply(`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`); }
    if (commandName === 'serverinfo') { if (!int.guild) return int.reply(`Only works in servers`); return int.reply(`${int.guild.name} | ${int.guild.memberCount} members`); }
    if (commandName === 'userinfo') { const u = options.getUser('user')||user; return int.reply(`${u.tag}\nID: ${u.id}`); }
    if (commandName === 'avatar') { const u = options.getUser('user')||user; return int.reply(u.displayAvatarURL({size:1024})); }

    saveData();
  } catch (e) { console.error(e); int.reply({content:`Error running command`,ephemeral:true}).catch(()=>{}); }
});

// ─────────────────────────────────────────────────────────────
// OPTIONAL PREFIX COMMANDS (FALLBACK)
// ─────────────────────────────────────────────────────────────
client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.content.startsWith(PREFIX)) return;
  // Simple fallback only
  if (msg.content === `${PREFIX}help`) return msg.reply(HELP_TEXT);
});

client.login(process.env.BOT_TOKEN);