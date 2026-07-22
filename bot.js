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

// 🔹 RANK LIST (EXACT ROLES)
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

const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' },
  { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' }
];
const PERF_TAGS = { start: 'Good', excellent: { minCredits: 500, minActiveDays: 21 }, bad: { maxCredits: 100, maxActiveDays: 7 }, verge: { maxCredits: 50, maxActiveDays: 3, warns: 2 } };

// ---------- Data ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return freshData();
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  d.lastActive ??= {}; d.inactivityWarns ??= {}; d.config ??= { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID };
  d.dailyCredits ??= {}; d.pfps ??= {}; d.onBreak ??= {}; d.feedbacks ??= []; d.performance ??= {}; d.lastDailyClaim ??= {};
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

// 🔹 PRESET USERS (EXACTLY AS REQUESTED)
const PRESET_RANKS = [
  { id: '1446192510593662976', rank: 'Moderator' },
  { id: '1320483185636802592', rank: 'Moderator' },
  { id: '1269872382701604895', rank: 'Moderator' },
  { id: '1222684836091658330', rank: 'Server Manager' },
  { id: '1198527966972477505', rank: 'Server Manager' } // YOU
];
PRESET_RANKS.forEach(u => {
  const idx = getRankIndex(u.rank);
  if (data.ranks[u.id] !== idx) {
    data.ranks[u.id] = idx;
    data.credits[u.id] = u.rank === 'Server Manager' ? 9999 : (data.credits[u.id] || 0);
    data.performance[u.id] ??= { tag: 'Good' };
    if (u.rank === 'Server Manager') data.performance[u.id].tag = 'Excellent';
  }
});
saveData(data);

// ---------- Helpers ----------
function getLogChannel(g) { return g.channels.cache.get(data.config.logChannelId); }
function getProfileChannel(g) { return g.channels.cache.get(data.config.profileChannelId); }
function findRole(g, name) { return g.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase()); }
function isModerator(id) { return (data.ranks[id] ?? -1) >= 0; }
function isServerManager(id) { return data.ranks[id] === getRankIndex('Server Manager'); }

function autoTag(credits) {
  let t = TAG_THRESHOLDS[0].tag;
  TAG_THRESHOLDS.forEach(x => { if (credits >= x.min) t = x.tag; });
  return t;
}
function perfTag(id) {
  const stats = data.performance[id] || { tag: PERF_TAGS.start };
  const c = data.credits[id] || 0;
  const warns = (data.warns[id] || []).length;
  const days = (Date.now() - (data.lastActive[id] || 0)) / 86400000;
  if (c >= 500 && days <= 21) return 'Excellent';
  if (c <= 50 && days >= 3 && warns >= 2) return 'Verge of Demotion';
  if (c <= 100 && days >= 7) return 'Bad';
  return stats.tag;
}
function updateTags(id) {
  if (data.tags[id]?.manual) return;
  data.tags[id] = { text: `${autoTag(data.credits[id]||0)} | ${perfTag(id)}`, manual: false };
  saveData(data);
}
function addCredits(id, amt) {
  data.credits[id] = Math.max(0, (data.credits[id] || 0) + amt);
  data.dailyCredits[id] = (data.dailyCredits[id] || 0) + amt;
  updateTags(id);
}
function markActive(id) {
  data.lastActive[id] = Date.now();
  data.inactivityWarns[id] = 0;
  updateTags(id);
}

// 🔹 CORE: SET ANY RANK + ROLE
async function setMemberRank(guild, member, rankName) {
  const newIdx = getRankIndex(rankName);
  if (newIdx === -1) return null;
  const oldIdx = data.ranks[member.id] ?? -1;

  // Remove old role
  if (oldIdx >= 0) {
    const oldRole = findRole(guild, RANK_NAMES[oldIdx]);
    if (oldRole) await member.roles.remove(oldRole).catch(() => {});
  }
  // Add new role
  const newRole = findRole(guild, rankName);
  if (newRole) await member.roles.add(newRole).catch(() => {});

  // Update data
  data.ranks[member.id] = newIdx;
  data.performance[member.id] ??= { tag: 'Good' };
  updateTags(member.id);
  saveData(data);
  return { old: RANK_NAMES[oldIdx] || 'None', new: rankName };
}

// ---------- Simple Help ----------
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
${PREFIX}roster       - List mods
${PREFIX}setrank      - [Server Manager] Set ANY rank
${PREFIX}settag       - Custom tag
${PREFIX}setup        - Admin config
${PREFIX}warn         - 2w timeout
\`\`\``;
  const info = {
    setrank: `Usage: ${PREFIX}setrank @user "Rank Name"\nExample: ${PREFIX}setrank @User Server Manager\n**Server Manager ONLY** — auto-assigns role!`
  };
  return `\`\`\`${PREFIX}${cmd}\n${info[cmd] || 'No description'}\`\`\``;
}

// ---------- Events ----------
client.once('ready', () => console.log('✅ Ready — Preset ranks + setrank command active'));

client.on('messageCreate', async msg => {
  if (msg.author.bot || !msg.guild || !msg.content.startsWith(PREFIX)) return;
  const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  // Help
  if (cmd === 'help') return msg.reply(helpMenu(args[0]?.toLowerCase()));

  // Daily Claim
  if (cmd === 'claim') {
    if (!isModerator(msg.author.id)) return msg.reply('❌ Mods only');
    const today = new Date().toDateString();
    if (data.lastDailyClaim[msg.author.id] === today) return msg.reply('❌ Already claimed today');
    data.lastDailyClaim[msg.author.id] = today;
    addCredits(msg.author.id, DAILY_REWARD);
    return msg.reply(`✅ +${DAILY_REWARD} daily credits`);
  }

  // 🔹 SET RANK (SERVER MANAGER ONLY)
  if (cmd === 'setrank') {
    if (!isServerManager(msg.author.id)) return msg.reply('❌ Server Manager ONLY');
    const target = msg.mentions.members.first();
    const rankName = args.slice(1).join(' ').trim();
    if (!target || !rankName) return msg.reply(`Usage: ${PREFIX}setrank @user <Rank Name>\nValid: ${RANK_NAMES.join(', ')}`);
    if (!RANK_NAMES.includes(rankName)) return msg.reply(`❌ Invalid rank: ${rankName}`);
    const res = await setMemberRank(msg.guild, target, rankName);
    return msg.reply(`✅ ${target} changed from **${res.old}** → **${res.new}**`);
  }

  // Setup
  if (cmd === 'setup' && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    if (args[0] === 'profilechannel') {
      const ch = msg.mentions.channels.first() || msg.guild.channels.cache.get(args[1]);
      if (!ch) return msg.reply(`Use: ${PREFIX}setup profilechannel #channel`);
      data.config.profileChannelId = ch.id; saveData(data);
      return msg.reply(`✅ Profile channel → ${ch}`);
    }
  }

  // Mark active
  if (['addcredits','removecredits','ban','break','unbreak','demote','feedback','kick','majorwarn','minorwarn','mute','profile','rankmod','rankup','roster','settag','warn'].includes(cmd)) {
    markActive(msg.author.id);
  }

  // Rankmod
  if (cmd === 'rankmod') {
    const target = msg.mentions.members.first();
    if (!target || isModerator(target.id)) return msg.reply('❌ Invalid target');
    return setMemberRank(msg.guild, target, 'Trial Moderator').then(() => msg.reply(`✅ ${target} → Trial Moderator`));
  }

  // Rankup
  if (cmd === 'rankup') {
    const idx = data.ranks[msg.author.id] ?? -1;
    const next = RANK_LADDER[idx+1];
    if (!next) return msg.reply('✅ Max rank');
    if ((data.credits[msg.author.id] || 0) < next.cost) return msg.reply(`❌ Need ${next.cost} credits`);
    return setMemberRank(msg.guild, msg.member, next.name).then(() => {
      data.credits[msg.author.id] -= next.cost; saveData(data);
      msg.reply(`🎉 Promoted to **${next.name}**`);
    });
  }

  // Profile
  if (cmd === 'profile') {
    const target = msg.mentions.members.first() || msg.member;
    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}`)
      .addFields(
        {name:'Rank',value:RANK_NAMES[data.ranks[target.id]??-1]||'—',inline:true},
        {name:'Credits',value:`${data.credits[target.id]||0}`,inline:true},
        {name:'Performance',value:perfTag(target.id),inline:true}
      )
      .setColor('Blue');
    msg.reply({embeds:[embed]});
  }
});

client.login(process.env.BOT_TOKEN);