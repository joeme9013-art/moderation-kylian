require('dotenv').config();
const { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const PREFIX = '?';
const DATA_FILE = './data.json';
const GUILD_ID = '1324059331406069872';
const MOD_OF_THE_DAY_CHANNEL_ID = '1528326035605819402';
const DEFAULT_LOG_CHANNEL_ID = '1529221027899379722';
const PROFILE_CHANNEL_ID = '1528326521721196544';
const DAILY_REWARD = 5;

// 🔹 RANKS
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

// 🔹 TAGS & PERFORMANCE
const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' },
  { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' }
];
const PERFECT_TAGS = {
  GOOD: 'Good',
  EXCELLENT: 'Excellent',
  BAD: 'Bad',
  VERGE: 'Verge of Demotion'
};
const PERF_RULES = {
  excellent: { minCredits: 500, maxDaysInactive: 21 },
  bad: { maxCredits: 100, minDaysInactive: 7 },
  verge: { maxCredits: 50, minDaysInactive: 3, minWarns: 2 }
};

// ---------- Data System ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return freshData();
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  d.lastActive ??= {}; d.inactivityWarns ??= {};
  d.config ??= { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID };
  d.dailyCredits ??= {}; d.pfps ??= {}; d.onBreak ??= {};
  d.feedbacks ??= []; d.performance ??= {}; d.lastDailyClaim ??= {}; d.tags ??= {};
  return d;
}
function freshData() {
  return {
    credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {}, inactivityWarns: {},
    config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
    dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: [], performance: {}, lastDailyClaim: {}
  };
}
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }
let data = loadData();

// 🔹 PRESET USERS
const PRESET_RANKS = [
  { id: '1446192510593662976', rank: 'Moderator' },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' }
];
PRESET_RANKS.forEach(u => {
  const idx = getRankIndex(u.rank);
  if (data.ranks[u.id] !== idx) {
    data.ranks[u.id] = idx;
    data.credits[u.id] = u.rank === 'Server Manager' ? 9999 : (data.credits[u.id] || 0);
  }
  // Auto-init performance & tags
  data.performance[u.id] ??= { tag: PERFECT_TAGS.GOOD };
  data.tags[u.id] ??= { text: getFullTag(u.id), manual: false };
});
saveData(data);

// ---------- Core Helpers ----------
function getLogChannel(g) { return g.channels.cache.get(data.config.logChannelId); }
function getProfileChannel(g) { return g.channels.cache.get(data.config.profileChannelId); }
function findRole(g, name) { return g.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase()); }
function isModerator(id) { return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { return data.ranks[id] === getRankIndex('Server Manager'); }

// ✅ NO BLANKS: Always returns full tag
function getBaseTag(credits = 0) {
  let base = TAG_THRESHOLDS[0].tag;
  TAG_THRESHOLDS.forEach(rule => { if (credits >= rule.min) base = rule.tag; });
  return base;
}
function getPerfTag(id) {
  const credits = data.credits[id] || 0;
  const lastSeen = data.lastActive[id] || 0;
  const daysInactive = (Date.now() - lastSeen) / (1000 * 60 * 60 * 24);
  const warns = (data.warns[id] || []).length;

  if (credits >= PERF_RULES.excellent.minCredits && daysInactive <= PERF_RULES.excellent.maxDaysInactive)
    return PERFECT_TAGS.EXCELLENT;
  if (credits <= PERF_RULES.verge.maxCredits && daysInactive >= PERF_RULES.verge.minDaysInactive && warns >= PERF_RULES.verge.minWarns)
    return PERFECT_TAGS.VERGE;
  if (credits <= PERF_RULES.bad.maxCredits && daysInactive >= PERF_RULES.bad.minDaysInactive)
    return PERFECT_TAGS.BAD;
  return data.performance[id]?.tag || PERFECT_TAGS.GOOD;
}
function getFullTag(id) {
  const credits = data.credits[id] || 0;
  return `${getBaseTag(credits)} | ${getPerfTag(id)}`;
}
function refreshTag(id) {
  if (data.tags[id]?.manual) return;
  data.tags[id] = { text: getFullTag(id), manual: false };
  saveData(data);
}
function addCredits(id, amt) {
  data.credits[id] = Math.max(0, (data.credits[id] || 0) + amt);
  data.dailyCredits[id] = (data.dailyCredits[id] || 0) + amt;
  refreshTag(id);
}
function markActive(id) {
  data.lastActive[id] = Date.now();
  data.inactivityWarns[id] = 0;
  refreshTag(id);
}

// 🔹 Set Any Rank
async function setMemberRank(guild, member, rankName) {
  const newIdx = getRankIndex(rankName);
  if (newIdx === -1) return null;
  const oldIdx = data.ranks[member.id] ?? -1;

  if (oldIdx >= 0) {
    const oldRole = findRole(guild, RANK_NAMES[oldIdx]);
    if (oldRole) await member.roles.remove(oldRole).catch(() => {});
  }
  const newRole = findRole(guild, rankName);
  if (newRole) await member.roles.add(newRole).catch(() => {});

  data.ranks[member.id] = newIdx;
  data.performance[member.id] ??= { tag: PERFECT_TAGS.GOOD };
  refreshTag(member.id);
  saveData(data);
  return { old: RANK_NAMES[oldIdx] || 'None', new: rankName };
}

// ---------- Help Menu ----------
function helpMenu(cmd) {
  if (!cmd) return `\`\`\`
Prefix: ${PREFIX}
Type ${PREFIX}help command for details.

Commands:
${PREFIX}addcredits   - Give credits
${PREFIX}removecredits - Take credits
${PREFIX}ban          - Ban user
${PREFIX}break        - Pause inactivity
${PREFIX}unbreak      - Resume
${PREFIX}claim        - Daily ${DAILY_REWARD} credits
${PREFIX}demote       - Demote mod
${PREFIX}feedback     - Send feedback
${PREFIX}kick         - Kick user
${PREFIX}majorwarn    - 3w timeout
${PREFIX}minorwarn    - 1w timeout
${PREFIX}mute         - 10m timeout
${PREFIX}profile      - View profile
${PREFIX}rankmod      - Make Trial Mod
${PREFIX}rankup       - Rank up (costs)
${PREFIX}roster       - ✅ Full list (no blanks!)
${PREFIX}setrank      - [Server Manager] Assign ANY rank
${PREFIX}settag       - Custom tag
${PREFIX}setup        - Admin config
${PREFIX}warn         - 2w timeout
\`\`\``;
  return `\`\`\`${PREFIX}${cmd}\nDetails for command ${cmd}\`\`\``;
}

// ---------- Events ----------
client.once('ready', () => {
  console.log('✅ Ready — No Blanks | Tags: Good/Excellent/Bad/Verge of Demotion');
});

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === 'help') return msg.reply(helpMenu(args[0]?.toLowerCase()));

  if (cmd === 'claim') {
    if (!isModerator(msg.author.id)) return msg.reply('❌ Mods only');
    const today = new Date().toDateString();
    if (data.lastDailyClaim[msg.author.id] === today) return msg.reply('❌ Already claimed today');
    data.lastDailyClaim[msg.author.id] = today;
    addCredits(msg.author.id, DAILY_REWARD);
    return msg.reply(`✅ +${DAILY_REWARD} daily credits`);
  }

  if (cmd === 'setrank') {
    if (!isServerManager(msg.author.id)) return msg.reply('❌ Server Manager ONLY');
    const target = msg.mentions.members.first();
    const rankName = args.slice(1).join(' ').trim();
    if (!target || !rankName || !RANK_NAMES.includes(rankName))
      return msg.reply(`Usage: ${PREFIX}setrank @user <Rank Name>`);
    const res = await setMemberRank(msg.guild, target, rankName);
    return msg.reply(`✅ ${target}: ${res.old} → ${res.new}`);
  }

  // ✅ ROSTER — NO BLANKS EVER
  if (cmd === 'roster') {
    const guild = msg.guild;
    const grouped = {};
    RANK_NAMES.forEach(r => grouped[r] = []);

    for (const [userId] of Object.entries(data.ranks)) {
      const rankIdx = data.ranks[userId];
      const rankName = RANK_NAMES[rankIdx];
      if (!rankName) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      // Always get fresh tag, no fallbacks to blank
      const tag = getFullTag(userId);
      grouped[rankName].push(`${member.user.tag} — ${tag}`);
    }

    const embed = new EmbedBuilder().setTitle('📋 Full Moderation Roster').setColor(0x2ECC71);
    [...RANK_NAMES].reverse().forEach(rank => {
      if (grouped[rank].length) embed.addFields({ name: rank, value: grouped[rank].join('\n') });
    });
    return msg.reply({ embeds: [embed] });
  }

  if (['addcredits','removecredits','ban','break','unbreak','demote','feedback','kick','majorwarn','minorwarn','mute','profile','rankmod','rankup','settag','warn'].includes(cmd)) {
    markActive(msg.author.id);
  }

  if (cmd === 'profile') {
    const target = msg.mentions.members.first() || msg.member;
    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        {name:'Rank',value:RANK_NAMES[data.ranks[target.id]??-1]||'—',inline:true},
        {name:'Credits',value:`${data.credits[target.id]||0}`,inline:true},
        {name:'Status',value:getPerfTag(target.id),inline:true}
      )
      .setColor('Blue');
    msg.reply({embeds:[embed]});
  }
});

client.login(process.env.BOT_TOKEN);