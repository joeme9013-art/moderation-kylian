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

// 🔹 FULL RANK LIST
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
const PERF_TAGS = {
  start: 'Good',
  excellent: { minCredits: 500, minActiveDays: 21 },
  bad: { maxCredits: 100, maxActiveDays: 7 },
  verge: { maxCredits: 50, maxActiveDays: 3, warns: 2 }
};

// ---------- Data System ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return freshData();
  const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  d.lastActive ??= {}; d.inactivityWarns ??= {};
  d.config ??= { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID };
  d.dailyCredits ??= {}; d.pfps ??= {}; d.onBreak ??= {};
  d.feedbacks ??= []; d.performance ??= {}; d.lastDailyClaim ??= {};
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
  { id: '1198527966972477505', rank: 'Server Manager' }
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
  if (c >= PERF_TAGS.excellent.minCredits && days <= PERF_TAGS.excellent.minActiveDays) return 'Excellent';
  if (c <= PERF_TAGS.verge.maxCredits && days >= PERF_TAGS.verge.maxActiveDays && warns >= PERF_TAGS.verge.warns) return 'Verge of Demotion';
  if (c <= PERF_TAGS.bad.maxCredits && days >= PERF_TAGS.bad.maxActiveDays) return 'Bad';
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
  if (data.inactivityWarns[id]) data.inactivityWarns[id] = 0;
  updateTags(id);
}

// 🔹 SET ANY RANK + ROLE
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
  data.performance[member.id] ??= { tag: 'Good' };
  updateTags(member.id);
  saveData(data);
  return { old: RANK_NAMES[oldIdx] || 'None', new: rankName };
}

// ---------- Simple Help Menu ----------
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
${PREFIX}rankup       - Rank up (costs credits)
${PREFIX}roster       - ✅ List all mods by rank
${PREFIX}setrank      - [Server Manager] Set ANY rank
${PREFIX}settag       - Set custom tag
${PREFIX}setup        - Admin config
${PREFIX}warn         - 2w timeout
\`\`\``;
  const info = {
    setrank: `Usage: ${PREFIX}setrank @user <Rank Name>\nExample: ${PREFIX}setrank @User Server Manager`,
    roster: `Usage: ${PREFIX}roster\nShows full list of moderators grouped by rank`
  };
  return `\`\`\`${PREFIX}${cmd}\n${info[cmd] || 'No description'}\`\`\``;
}

// ---------- Core Systems ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30 };
const RANK_REQUIREMENTS = { mute:0, warn:0, minorwarn:0, kick:1, majorwarn:1, ban:2, demote:5, addcredits:5, removecredits:5, rankmod:3 };

async function checkInactivity(guild) {
  const log = getLogChannel(guild); const now=Date.now();
  for(const uid of Object.keys(data.ranks)){
    if(data.onBreak[uid]) continue;
    const idx=data.ranks[uid]; if(idx<=0) continue;
    if(now-(data.lastActive[uid]||0)<7*86400000) continue;
    data.inactivityWarns[uid]=(data.inactivityWarns[uid]||0)+1;
    const cnt=data.inactivityWarns[uid];
    const member=await guild.members.fetch(uid).catch(()=>null); if(!member) continue;
    if(cnt>=3){
      const newRank=await demoteMember(guild,member);
      data.inactivityWarns[uid]=0; saveData(data);
      log?.send(newRank?`⬇️ ${member} → ${newRank}`:`⚠️ ${member} max warnings`);
    }else saveData(data);
  }
}
async function demoteMember(guild, member) {
  const idx = data.ranks[member.id];
  if (idx <= 0) return null;
  return setMemberRank(guild, member, RANK_NAMES[idx-1]).then(r=>r.new);
}
const WARN_DURATIONS = { warn:2, minorwarn:1, majorwarn:3 };
async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) return message.reply(`Use: ${PREFIX}${type} @user`);
  try { await target.timeout(WARN_DURATIONS[type]*7*86400000); }
  catch { return message.reply('❌ Failed'); }
  data.warns[target.id]??=[]; data.warns[target.id].push({type,by:message.author.id,at:Date.now()});
  updateTags(target.id); saveData(data);
  message.reply(`${target} → **${type}**`);
}

// ---------- Ready & Events ----------
client.once('ready', () => {
  const guild=client.guilds.cache.get(GUILD_ID);
  if(guild) setInterval(()=>checkInactivity(guild), 86400000);
  console.log('✅ Ready — Roster Fixed + All Features Working');
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
      return msg.reply(`Usage: ${PREFIX}setrank @user <Rank Name>\nValid: ${RANK_NAMES.join(', ')}`);
    const res = await setMemberRank(msg.guild, target, rankName);
    return msg.reply(`✅ ${target} changed: **${res.old}** → **${res.new}**`);
  }

  if (cmd === 'setup' && msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    if (args[0] === 'profilechannel') {
      const ch = msg.mentions.channels.first() || msg.guild.channels.cache.get(args[1]);
      if (!ch) return msg.reply(`Use: ${PREFIX}setup profilechannel #1528326521721196544`);
      data.config.profileChannelId = ch.id; saveData(data);
      return msg.reply(`✅ Profile channel → ${ch}`);
    }
  }

  if (['addcredits','removecredits','ban','break','unbreak','demote','feedback','kick','majorwarn','minorwarn','mute','profile','rankmod','rankup','roster','settag','warn'].includes(cmd)) {
    markActive(msg.author.id);
    if (RANK_REQUIREMENTS[cmd]!==undefined && (data.ranks[msg.author.id]??-1) < RANK_REQUIREMENTS[cmd])
      return msg.reply(`🚫 Need **${RANK_NAMES[RANK_REQUIREMENTS[cmd]]}**+`);
  }

  // ✅ FULLY FIXED ROSTER COMMAND
  if (cmd === 'roster') {
    const guild = msg.guild;
    const grouped = {};
    RANK_NAMES.forEach(r => grouped[r] = []);

    for (const [userId, rankIdx] of Object.entries(data.ranks)) {
      const rankName = RANK_NAMES[rankIdx];
      if (!rankName) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;
      const tag = data.tags[userId]?.text || '—';
      grouped[rankName].push(`${member.user.tag} — ${tag}`);
    }

    const embed = new EmbedBuilder().setTitle('📋 Full Moderation Roster').setColor(0x2ECC71);
    [...RANK_NAMES].reverse().forEach(rank => {
      if (grouped[rank].length > 0) embed.addFields({ name: rank, value: grouped[rank].join('\n'), inline: false });
    });
    return msg.reply({ embeds: [embed] });
  }

  if (cmd === 'break') {
    if (!isModerator(msg.author.id)) return msg.reply('❌ Not mod');
    data.onBreak[msg.author.id] = Date.now(); saveData(data);
    return msg.reply('🌴 Break enabled');
  }
  if (cmd === 'unbreak') {
    delete data.onBreak[msg.author.id]; markActive(msg.author.id); saveData(data);
    return msg.reply('👋 Back active');
  }

  if (cmd === 'rankmod') {
    const target = msg.mentions.members.first();
    if (!target || isModerator(target.id)) return msg.reply('❌ Invalid target');
    return setMemberRank(msg.guild, target, 'Trial Moderator').then(() => msg.reply(`✅ ${target} → Trial Moderator`));
  }

  if (cmd === 'feedback') {
    const text = args.join(' ').trim();
    if (!text) return msg.reply(`Usage: ${PREFIX}feedback text`);
    getLogChannel(msg.guild)?.send({ embeds: [new EmbedBuilder().setTitle('📝 Feedback').setDescription(text).addFields({name:'From',value:msg.author.tag}).setColor(0x3498DB)] });
    return msg.reply('✅ Sent');
  }

  if (cmd === 'addcredits' || cmd === 'removecredits') {
    const target = msg.mentions.members.first();
    const amt = parseInt(args[1]);
    if (!target || isNaN(amt)) return msg.reply(`Usage: ${PREFIX}${cmd} @user amount`);
    addCredits(target.id, cmd === 'addcredits' ? amt : -amt);
    return msg.reply(`${target}: ${data.credits[target.id]} credits`);
  }

  if (['warn','minorwarn','majorwarn'].includes(cmd)) { await applyWarn(msg, cmd); return; }

  if (['mute','kick','ban'].includes(cmd)) {
    const target = msg.mentions.members.first();
    if (!target) return msg.reply(`Usage: ${PREFIX}${cmd} @user`);
    try {
      if (cmd === 'mute') await target.timeout(10*60*1000);
      if (cmd === 'kick') await target.kick();
      if (cmd === 'ban') await target.ban({reason:`By ${msg.author.tag}`});
      addCredits(msg.author.id, CREDIT_REWARDS[cmd]);
      return msg.reply(`✅ ${cmd} | +${CREDIT_REWARDS[cmd]}cr`);
    } catch { return msg.reply('❌ Failed'); }
  }

  if (cmd === 'settag') {
    const target = msg.mentions.members.first() || msg.member;
    if (target.id !== msg.author.id && (data.ranks[msg.author.id]??-1) < 3) return msg.reply('❌ Need Head Mod+');
    const newTag = msg.mentions.members.first() ? args.slice(1).join(' ').trim() : args.join(' ').trim();
    if (!newTag) return msg.reply(`Usage: ${PREFIX}settag [@user] text`);
    data.tags[target.id] = { text: newTag, manual: true }; saveData(data);
    return msg.reply(`✅ Tag set`);
  }

  if (cmd === 'profile') {
    const target = msg.mentions.members.first() || msg.member;
    const embed = new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        {name:'Rank',value:RANK_NAMES[data.ranks[target.id]??-1]||'—',inline:true},
        {name:'Credits',value:`${data.credits[target.id]||0}`,inline:true},
        {name:'Performance',value:perfTag(target.id),inline:true},
        {name:'Warns',value:`${(data.warns[target.id]||[]).length}`,inline:true}
      )
      .setColor(0x5865F2);
    msg.reply({embeds:[embed]});
    getProfileChannel(msg.guild)?.send({embeds:[embed]});
  }

  if (cmd === 'demote') {
    if (!isServerManager(msg.author.id) && (data.ranks[msg.author.id]??-1) < 5) return msg.reply('❌ No permission');
    const target = msg.mentions.members.first();
    if (!target) return msg.reply(`Usage: ${PREFIX}demote @user`);
    const newRank = await demoteMember(msg.guild, target);
    return msg.reply(newRank ? `✅ ${target} → ${newRank}` : '❌ Failed');
  }

  if (cmd === 'rankup') {
    const idx = data.ranks[msg.author.id] ?? -1;
    const next = RANK_LADDER[idx+1];
    if (!next) return msg.reply('✅ Max rank');
    if ((data.credits[msg.author.id]||0) < next.cost) return msg.reply(`❌ Need ${next.cost} credits`);
    return setMemberRank(msg.guild, msg.member, next.name).then(() => {
      data.credits[msg.author.id] -= next.cost; saveData(data);
      msg.reply(`🎉 Promoted to **${next.name}**`);
    });
  }
});

client.login(process.env.BOT_TOKEN);