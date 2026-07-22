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
const AUTO_TRAINING_CHANNEL_ID = '1528327903371202653';

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_INACTIVITY_WARNS = 3;
const MOD_OF_DAY_BONUS = 50;
const DAILY_REWARD = 5; // 5 credits daily
const AUTO_TRAIN_ANSWER_WINDOW_MS = 60 * 1000;
const AUTO_TRAIN_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const AUTO_TRAIN_MAX_GAP_MS = 30 * 60 * 60 * 1000;

const YOUR_USER_ID = '1198527966972477505';

// 🔹 EXACT ROLE LIST (for recognition)
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

// ---------- Data ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {},
      inactivityWarns: {}, config: { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID },
      dailyCredits: {}, pfps: {}, onBreak: {}, feedbacks: [], performance: {},
      lastDailyClaim: {} // track daily reward
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {}; parsed.inactivityWarns ??= {};
  parsed.config ??= { profileChannelId: PROFILE_CHANNEL_ID, logChannelId: DEFAULT_LOG_CHANNEL_ID };
  parsed.dailyCredits ??= {}; parsed.pfps ??= {}; parsed.onBreak ??= {};
  parsed.feedbacks ??= []; parsed.performance ??= {}; parsed.lastDailyClaim ??= {};
  return parsed;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

// 🔹 Set YOU to Server Manager
const SERVER_MANAGER_INDEX = RANK_LADDER.length - 1;
if (data.ranks[YOUR_USER_ID] !== SERVER_MANAGER_INDEX) {
  data.ranks[YOUR_USER_ID] = SERVER_MANAGER_INDEX;
  data.credits[YOUR_USER_ID] = 9999;
  data.performance[YOUR_USER_ID] = { tag: 'Excellent' };
  saveData(data);
}

// ---------- Helpers ----------
function getLogChannel(guild) { return guild.channels.cache.get(data.config.logChannelId || DEFAULT_LOG_CHANNEL_ID); }
function getProfileChannel(guild) { return guild.channels.cache.get(data.config.profileChannelId || PROFILE_CHANNEL_ID); }
function findRoleByName(guild, name) { 
  if (!guild) return null;
  return guild.roles.cache.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase()); 
}
// ✅ MODERATOR RECOGNITION
function isModerator(userId) {
  return getRankIndex(userId) >= 0;
}

function computeAutoTag(credits) {
  let current = TAG_THRESHOLDS[0].tag;
  for (const t of TAG_THRESHOLDS) if (credits >= t.min) current = t.tag;
  return current;
}
function getPerformanceTag(userId) {
  const stats = data.performance[userId] || { tag: PERF_TAGS.start };
  const credits = data.credits[userId] || 0;
  const warns = (data.warns[userId] || []).length;
  const daysActive = (Date.now() - (data.lastActive[userId] || 0)) / (1000 * 86400);

  if (credits >= PERF_TAGS.excellent.minCredits && daysActive <= PERF_TAGS.excellent.minActiveDays) return 'Excellent';
  if (credits <= PERF_TAGS.verge.maxCredits && daysActive >= PERF_TAGS.verge.maxActiveDays && warns >= PERF_TAGS.verge.warns) return 'Verge of Demotion';
  if (credits <= PERF_TAGS.bad.maxCredits && daysActive >= PERF_TAGS.bad.maxActiveDays) return 'Bad';
  return stats.tag || PERF_TAGS.start;
}
function updateTag(userId) {
  if (data.tags[userId]?.manual) return;
  const base = computeAutoTag(data.credits[userId]||0);
  const perf = getPerformanceTag(userId);
  data.tags[userId] = { text: `${base} | ${perf}`, manual: false };
  saveData(data);
}

// ---------- ✅ SIMPLE HELP (NO CATEGORIES) ----------
function showHelp() {
  return `\`\`\`
Prefix: ${PREFIX}
Type ${PREFIX}help command for more info on a command.

Commands:
${PREFIX}addcredits   - Give credits to a user
${PREFIX}removecredits - Take credits from a user
${PREFIX}ban          - Ban a user
${PREFIX}break        - Pause inactivity checks
${PREFIX}unbreak      - Return from break
${PREFIX}claim        - Claim daily reward (${DAILY_REWARD} credits)
${PREFIX}demote       - Lower a moderator's rank
${PREFIX}feedback     - Send feedback
${PREFIX}kick         - Kick a user
${PREFIX}majorwarn    - 3-week timeout
${PREFIX}minorwarn    - 1-week timeout
${PREFIX}mute         - 10-minute timeout
${PREFIX}profile      - View your/another's profile
${PREFIX}progress     - View training stats
${PREFIX}rankmod      - Add new Trial Moderator
${PREFIX}rankup       - Upgrade your rank
${PREFIX}roster       - List all moderators
${PREFIX}settag       - Set custom tag
${PREFIX}setpfp       - Set profile picture
${PREFIX}setup        - Configure bot (Admin only)
${PREFIX}warn         - 2-week timeout
\`\`\``;
}
function showCommandHelp(cmd) {
  const info = {
    addcredits: `Usage: ${PREFIX}addcredits @user amount → Give credits`,
    removecredits: `Usage: ${PREFIX}removecredits @user amount → Remove credits`,
    ban: `Usage: ${PREFIX}ban @user → Ban user`,
    break: `Usage: ${PREFIX}break → Pause inactivity`,
    unbreak: `Usage: ${PREFIX}unbreak → Resume activity tracking`,
    claim: `Usage: ${PREFIX}claim → Get ${DAILY_REWARD} credits once every 24h`,
    demote: `Usage: ${PREFIX}demote @user → Lower rank`,
    feedback: `Usage: ${PREFIX}feedback text → Send feedback`,
    kick: `Usage: ${PREFIX}kick @user → Kick user`,
    majorwarn: `Usage: ${PREFIX}majorwarn @user → 3-week timeout`,
    minorwarn: `Usage: ${PREFIX}minorwarn @user → 1-week timeout`,
    mute: `Usage: ${PREFIX}mute @user → 10-minute timeout`,
    profile: `Usage: ${PREFIX}profile [@user] → View profile`,
    progress: `Usage: ${PREFIX}progress [@user] → Training stats`,
    rankmod: `Usage: ${PREFIX}rankmod @user → Make Trial Mod`,
    rankup: `Usage: ${PREFIX}rankup → Spend credits to rank up`,
    roster: `Usage: ${PREFIX}roster → List all mods`,
    settag: `Usage: ${PREFIX}settag [@user] text → Set custom tag`,
    setpfp: `Usage: ${PREFIX}setpfp image-link → Set profile pic`,
    setup: `Usage: ${PREFIX}setup logchannel/#profilechannel → Admin only`,
    warn: `Usage: ${PREFIX}warn @user → 2-week timeout`
  };
  return `\`\`\`${PREFIX}${cmd}\n${info[cmd] || 'No description'}\`\`\``;
}

// ---------- Core Systems ----------
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };
const RANK_REQUIREMENTS = { mute:0, warn:0, minorwarn:0, kick:1, majorwarn:1, ban:2, demote:5, addcredits:5, removecredits:5, rankmod:3 };

function addCredits(userId, amount) {
  data.credits[userId] = Math.max(0, (data.credits[userId] || 0) + amount);
  data.dailyCredits[userId] = (data.dailyCredits[userId] || 0) + amount;
  updateTag(userId); saveData(data);
}
function markActive(userId) {
  data.lastActive[userId] = Date.now();
  if (data.inactivityWarns[userId]) data.inactivityWarns[userId] = 0;
  updateTag(userId); saveData(data);
}
function getRankIndex(userId) { return data.ranks[userId] ?? -1; }
function hasRequiredRank(userId, cmd) {
  const req = RANK_REQUIREMENTS[cmd];
  return req === undefined ? true : getRankIndex(userId) >= req;
}

// ---------- TRAINING (REMOVED TRAININGRP COMMAND) ----------
const quiz = [
  { q: 'NSFW content?', options: ['A: 1h', 'B: 1d timeout', 'C: Ban', 'D: Warn'], answer: 'B', rule: 'Rule 1 → 1 day timeout' },
  { q: 'Spam?', options: ['A: Kick', 'B: 10m', 'C: 60s timeout', 'D: Ban'], answer: 'C', rule: 'Rule 2 → 60s' },
  { q: 'Racism?', options: ['A: Warn', 'B: 5m timeout', 'C: 1h', 'D: Kick'], answer: 'B', rule: 'Rule 5 → 5m' },
  { q: 'Raiding?', options: ['A: 1w', 'B: Kick', 'C: Perm Ban', 'D: Warn'], answer: 'C', rule: 'Rule 7 → Perm Ban' },
  { q: 'Bullying?', options: ['A: 1h timeout', 'B: 5m', 'C: Ban', 'D: Mute'], answer: 'A', rule: 'Rule 6 → 1h' }
];
function shuffle(arr) { const c=[...arr]; for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];} return c; }
function recordTrainingResult(id, correct) {
  const s = data.trainingStats[id]||{taken:0,correct:0}; s.taken++; if(correct)s.correct++;
  data.trainingStats[id]=s; saveData(data);
}

async function checkInactivity(guild) {
  const log = getLogChannel(guild); const now=Date.now();
  for(const uid of Object.keys(data.ranks)){
    if(data.onBreak[uid]) continue;
    const idx=getRankIndex(uid); if(idx<=0) continue;
    if(now-(data.lastActive[uid]||0)<INACTIVITY_THRESHOLD_MS) continue;
    data.inactivityWarns[uid]=(data.inactivityWarns[uid]||0)+1;
    const cnt=data.inactivityWarns[uid];
    const member=await guild.members.fetch(uid).catch(()=>null); if(!member) continue;
    if(cnt>=MAX_INACTIVITY_WARNS){
      const newRank=await demoteMember(guild,member);
      data.inactivityWarns[uid]=0; data.lastActive[uid]=now; saveData(data);
      log?.send(newRank?`⬇️ ${member} → ${newRank}`:`⚠️ ${member} max warnings`);
    }else{
      saveData(data);
      member.send(`⚠️ Inactivity warning ${cnt}/${MAX_INACTIVITY_WARNS}`).catch(()=>{});
    }
  }
}

async function pickModeratorOfTheDay(guild) {
  const chan=guild.channels.cache.get(MOD_OF_THE_DAY_CHANNEL_ID); if(!chan) return;
  const entries=Object.entries(data.dailyCredits).filter(([,a])=>a>0); if(!entries.length) return;
  entries.sort((a,b)=>b[1]-a[1]); const [winnerId,amt]=entries[0];
  const member=await guild.members.fetch(winnerId).catch(()=>null);
  if(member){
    addCredits(winnerId,MOD_OF_DAY_BONUS);
    const embed=new EmbedBuilder().setTitle('🏆 Moderator of the Day')
      .setDescription(`${member} earned ${amt} credits today!`)
      .addFields({name:'Tag',value:data.tags[winnerId]?.text||'—'})
      .setColor(0xffd700).setThumbnail(member.user.displayAvatarURL());
    chan.send({embeds:[embed]});
  }
  data.dailyCredits={}; saveData(data);
}

async function runAutoTraining(guild) {
  const chan=guild.channels.cache.get(AUTO_TRAINING_CHANNEL_ID); if(!chan) return;
  const q=quiz[Math.floor(Math.random()*quiz.length)];
  await chan.send(`📚 **Surprise Training!**\n${q.q}\n${q.options.join('\n')}\nAnswer A/B/C/D in 60s`);
  try{
    const collected=await chan.awaitMessages({filter:m=>!m.bot&&isModerator(m.author.id),max:1,time:AUTO_TRAIN_ANSWER_WINDOW_MS,errors:['time']});
    const ans=collected.first(); const ok=ans.content.trim().toUpperCase()===q.answer;
    recordTrainingResult(ans.author.id,ok);
    if(ok){ addCredits(ans.author.id,CREDIT_REWARDS.correctAnswer); chan.send(`✅ ${q.rule}`); }
    else chan.send(`❌ ${q.answer} → ${q.rule}`);
  }catch{ chan.send(`⏱️ Time up!`); }
}
function scheduleNextAutoTraining(guild) {
  const gap=AUTO_TRAIN_MIN_GAP_MS+Math.random()*(AUTO_TRAIN_MAX_GAP_MS-AUTO_TRAIN_MIN_GAP_MS);
  setTimeout(async()=>{await runAutoTraining(guild); scheduleNextAutoTraining(guild);},gap);
}

async function demoteMember(guild, member) {
  const idx = getRankIndex(member.id);
  if (idx <= 0) return null;
  const curr = RANK_LADDER[idx], next = RANK_LADDER[idx-1];
  const currRole = findRoleByName(guild, curr.name), nextRole = findRoleByName(guild, next.name);
  try { if (currRole) await member.roles.remove(currRole); if (nextRole) await member.roles.add(nextRole); }
  catch { return null; }
  data.ranks[member.id] = idx-1; updateTag(member.id); saveData(data);
  return next.name;
}

const WARN_DURATIONS = { warn:2, minorwarn:1, majorwarn:3 };
async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) return message.reply(`Use: ${PREFIX}${type} @user`);
  const ms = WARN_DURATIONS[type] * 7 * 86400000;
  try { await target.timeout(ms, `${type} by ${message.author.tag}`); }
  catch { return message.reply('❌ Failed to timeout — check permissions'); }
  data.warns[target.id] ??= [];
  data.warns[target.id].push({ type, by:message.author.id, at:Date.now() });
  updateTag(target.id); saveData(data);
  message.reply(`${target} → **${type}**`);
  getLogChannel(message.guild)?.send(`📋 ${target} got ${type} from ${message.author}`);
}

// ---------- Ready & Events ----------
client.once('ready', () => {
  const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();
  if(guild){
    setInterval(()=>checkInactivity(guild),CHECK_INTERVAL_MS);
    setInterval(()=>pickModeratorOfTheDay(guild),CHECK_INTERVAL_MS);
    scheduleNextAutoTraining(guild);
  }
  console.log('✅ Bot Ready — Simple Help, No TrainingRP, Daily Reward, Mod Recognition');
});

client.on('messageCreate', async message => {
  if(message.author.bot||!message.guild||!message.content.startsWith(PREFIX)) return;
  const args=message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command=args.shift()?.toLowerCase();

  // 🔹 HELP
  if(command==='help'){
    if(args[0]) return message.reply(showCommandHelp(args[0]));
    return message.reply(showHelp());
  }

  // 🔹 DAILY CLAIM (5 CREDITS)
  if(command==='claim'){
    if(!isModerator(message.author.id)) return message.reply('❌ Only moderators can claim daily rewards');
    const today = new Date().toDateString();
    if(data.lastDailyClaim[message.author.id] === today) return message.reply('❌ Already claimed today! Come back tomorrow');
    data.lastDailyClaim[message.author.id] = today;
    addCredits(message.author.id, DAILY_REWARD);
    return message.reply(`✅ Claimed **${DAILY_REWARD}** daily credits!`);
  }

  // Permission check
  const ALL_COMMANDS = ['addcredits','removecredits','ban','break','unbreak','demote','feedback','kick','majorwarn','minorwarn','mute','profile','progress','rankmod','rankup','roster','settag','setpfp','setup','warn'];
  if(ALL_COMMANDS.includes(command)) markActive(message.author.id);
  if(RANK_REQUIREMENTS[command]!==undefined&&!hasRequiredRank(message.author.id,command)){
    const reqName=RANK_LADDER[RANK_REQUIREMENTS[command]].name;
    return message.reply(`🚫 Need **${reqName}** or higher`);
  }

  // 🔹 SETUP
  if(command==='setup'){
    if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ Admin only');
    if(args[0]==='logchannel'){
      const ch=message.mentions.channels.first();
      if(!ch) return message.reply(`Use: ${PREFIX}setup logchannel #channel`);
      data.config.logChannelId=ch.id; saveData(data);
      return message.reply(`✅ Log channel → ${ch}`);
    }
    if(args[0]==='profilechannel'){
      const ch=message.mentions.channels.first()||message.guild.channels.cache.get(args[1]);
      if(!ch) return message.reply(`Use: ${PREFIX}setup profilechannel #1528326521721196544`);
      data.config.profileChannelId=ch.id; saveData(data);
      return message.reply(`✅ Profile channel → ${ch}`);
    }
    return message.reply(`Options:\n${PREFIX}setup logchannel #channel\n${PREFIX}setup profilechannel #channel`);
  }

  if(command==='break'){
    if(!isModerator(message.author.id)) return message.reply('❌ Not on mod team');
    data.onBreak[message.author.id]=Date.now(); saveData(data);
    return message.reply('🌴 Break enabled — inactivity paused');
  }
  if(command==='unbreak'){
    delete data.onBreak[message.author.id]; markActive(message.author.id); saveData(data);
    return message.reply('👋 Welcome back — active again');
  }

  if(command==='rankmod'){
    const target=message.mentions.members.first();
    if(!target) return message.reply(`Usage: ${PREFIX}rankmod @user`);
    if(isModerator(target.id)) return message.reply('❌ Already a moderator');
    const trialRole=findRoleByName(message.guild, 'Trial Moderator');
    if(!trialRole) return message.reply('❌ Role "Trial Moderator" not found');
    try {
      await target.roles.add(trialRole);
      data.ranks[target.id]=0; data.credits[target.id]=0;
      data.performance[target.id]={tag:'Good'};
      updateTag(target.id); saveData(data);
      return message.reply(`✅ ${target} → **Trial Moderator** | Performance: **Good**`);
    }catch(e){ return message.reply('❌ Failed — check bot role hierarchy'); }
  }

  if(command==='feedback'){
    const text=args.join(' ').trim();
    if(!text) return message.reply(`Usage: ${PREFIX}feedback your message`);
    const embed=new EmbedBuilder().setTitle('📝 New Feedback').setDescription(text)
      .addFields({name:'From',value:`${message.author.tag} (${message.author.id})`})
      .setColor(0x3498DB);
    getLogChannel(message.guild)?.send({embeds:[embed]});
    data.feedbacks.push({from:message.author.id,text,at:Date.now()}); saveData(data);
    return message.reply('✅ Feedback submitted!');
  }

  if(command==='addcredits'||command==='removecredits'){
    const target=message.mentions.members.first();
    const amt=parseInt(args[1]);
    if(!target||isNaN(amt)||amt<=0) return message.reply(`Usage: ${PREFIX}${command} @user amount`);
    addCredits(target.id, command==='addcredits'?amt:-amt);
    return message.reply(`${target.user.tag}: ${data.credits[target.id]} credits`);
  }

  if(['warn','minorwarn','majorwarn'].includes(command)){ await applyWarn(message,command); return; }

  if(['mute','kick','ban'].includes(command)){
    const target=message.mentions.members.first();
    if(!target) return message.reply(`Usage: ${PREFIX}${command} @user`);
    try{
      if(command==='mute') await target.timeout(10*60*1000, `By ${message.author.tag}`);
      if(command==='kick') await target.kick(`By ${message.author.tag}`);
      if(command==='ban') await target.ban({reason: `By ${message.author.tag}`});
      addCredits(message.author.id,CREDIT_REWARDS[command]);
      return message.reply(`✅ ${command} successful! +${CREDIT_REWARDS[command]} credits`);
    }catch{ return message.reply('❌ Failed — check permissions/role position'); }
  }

  if(command==='settag'){
    const target=message.mentions.members.first()||message.member;
    if(target.id!==message.author.id&&getRankIndex(message.author.id)<3)
      return message.reply('❌ Need Head Moderator+ to edit others');
    const newTag=message.mentions.members.first()?args.slice(1).join(' ').trim():args.join(' ').trim();
    if(!newTag) return message.reply(`Usage: ${PREFIX}settag [@user] custom text`);
    data.tags[target.id]={text:newTag,manual:true}; saveData(data);
    return message.reply(`✅ ${target}'s tag set to: **${newTag}**`);
  }

  if(command==='setpfp'){
    const url=args[0];
    if(!url||!/^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)$/i.test(url))
      return message.reply(`Usage: ${PREFIX}setpfp <image link>`);
    data.pfps[message.author.id]=url; saveData(data);
    return message.reply('✅ Profile image updated!');
  }

  if(command==='profile'){
    const target=message.mentions.members.first()||message.member;
    const credits=data.credits[target.id]||0;
    const rankName=RANK_LADDER[getRankIndex(target.id)]?.name||'Not on team';
    const tag=data.tags[target.id]?.text||computeAutoTag(credits);
    const perf=getPerformanceTag(target.id);
    const warnCount=(data.warns[target.id]||[]).length;
    const pfp=data.pfps[target.id];

    const embed=new EmbedBuilder().setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        {name:'Rank',value:rankName,inline:true},
        {name:'Tag',value:tag,inline:true},
        {name:'Performance',value:perf,inline:true},
        {name:'Credits',value:`${credits}`,inline:true},
        {name:'Warns',value:`${warnCount}`,inline:true}
      )
      .setColor(0x5865F2);
    if(pfp) embed.setImage(pfp);
    message.reply({embeds:[embed]});
    getProfileChannel(message.guild)?.send({embeds:[embed]});
    return;
  }

  if(command==='progress'){
    const target=message.mentions.members.first()||message.member;
    const stats=data.trainingStats[target.id]||{taken:0,correct:0};
    const pct=stats.taken?Math.round((stats.correct/stats.taken)*100):0;
    const embed=new EmbedBuilder().setTitle(`${target.user.tag}'s Training Progress`)
      .addFields(
        {name:'Taken',value:`${stats.taken}`,inline:true},
        {name:'Correct',value:`${stats.correct}`,inline:true},
        {name:'Accuracy',value:`${pct}%`,inline:true}
      )
      .setColor(0x9B59B6);
    return message.reply({embeds:[embed]});
  }

  if(command==='roster'){
    const guild=message.guild;
    const grouped={}; RANK_LADDER.forEach(r=>grouped[r.name]=[]);
    for(const [uid,rankIdx] of Object.entries(data.ranks)){
      const rName=RANK_LADDER[rankIdx]?.name; if(!rName) continue;
      const m=await guild.members.fetch(uid).catch(()=>null); if(!m) continue;
      grouped[rName].push(`${m.user.tag} — ${data.tags[uid]?.text||'—'}`);
    }
    const embed=new EmbedBuilder().setTitle('📋 Mod Roster').setColor(0x2ECC71);
    [...RANK_LADDER].reverse().forEach(r=>{if(grouped[r.name].length) embed.addFields({name:r.name,value:grouped[r.name].join('\n')});});
    return message.reply({embeds:[embed]});
  }

  if(command==='modoftheday'){
    if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ Admin only');
    await pickModeratorOfTheDay(message.guild);
    return message.reply('✅ Mod of the Day announced!');
  }

  if(command==='demote'){
    const ok=getRankIndex(message.author.id)>=5||message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if(!ok) return message.reply(`🚫 Need **${RANK_LADDER[5].name}**+`);
    const target=message.mentions.members.first(); if(!target) return message.reply(`Usage: ${PREFIX}demote @user`);
    const newRank=await demoteMember(message.guild,target);
    return message.reply(newRank?`✅ ${target} demoted to **${newRank}**`:'❌ Failed to demote');
  }

  if(command==='rankup'){
    const userId=message.author.id;
    const guild=message.guild;
    const currIdx=getRankIndex(userId);
    const next=RANK_LADDER[currIdx+1]; if(!next) return message.reply('✅ Already max rank!');
    if((data.credits[userId]||0)<next.cost) return message.reply(`❌ Need ${next.cost} credits (you have ${data.credits[userId]||0})`);
    const currRole=findRoleByName(guild,RANK_LADDER[currIdx].name);
    const nextRole=findRoleByName(guild,next.name);
    if(!nextRole) return message.reply(`❌ Role "${next.name}" not found`);
    try{
      if(currRole) await message.member.roles.remove(currRole);
      await message.member.roles.add(nextRole);
    }catch{ return message.reply('❌ Role update failed — check bot hierarchy'); }
    data.credits[userId]-=next.cost; data.ranks[userId]=currIdx+1; updateTag(userId); saveData(data);
    return message.reply(`🎉 Promoted to **${next.name}**! Remaining: ${data.credits[userId]} credits`);
  }
});

client.login(process.env.BOT_TOKEN);
