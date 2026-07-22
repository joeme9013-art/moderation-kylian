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
const AUTO_TRAIN_ANSWER_WINDOW_MS = 60 * 1000;
const AUTO_TRAIN_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const AUTO_TRAIN_MAX_GAP_MS = 30 * 60 * 60 * 1000;

const YOUR_USER_ID = '1198527966972477505';

// 🔹 ROLE LIST (EXACT MATCH)
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

// 🔹 AUTO TAGS
const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' },
  { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' },
  { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' }
];

// 🔹 PERFORMANCE TAGS (AUTO)
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
      inactivityWarns: {}, config: { profileChannelId: PROFILE_CHANNEL_ID },
      dailyCredits: {}, pfps: {}, onBreak: {}, trainingStats: {}, feedbacks: [],
      performance: {}
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {}; parsed.inactivityWarns ??= {}; parsed.config ??= { profileChannelId: PROFILE_CHANNEL_ID };
  parsed.dailyCredits ??= {}; parsed.pfps ??= {}; parsed.onBreak ??= {};
  parsed.trainingStats ??= {}; parsed.feedbacks ??= []; parsed.performance ??= {};
  return parsed;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

// 🔹 Set YOU to Server Manager
const SERVER_MANAGER_INDEX = RANK_LADDER.length - 1;
if (data.ranks[YOUR_USER_ID] !== SERVER_MANAGER_INDEX) {
  data.ranks[YOUR_USER_ID] = SERVER_MANAGER_INDEX;
  data.credits[YOUR_USER_ID] = 9999;
  saveData(data);
}

// ---------- Helpers ----------
function getLogChannel(guild) {
  const id = data.config.logChannelId || DEFAULT_LOG_CHANNEL_ID;
  return guild.channels.cache.get(id);
}
function getProfileChannel(guild) {
  const id = data.config.profileChannelId || PROFILE_CHANNEL_ID;
  return guild.channels.cache.get(id);
}
function findRoleByName(guild, name) {
  if (!guild) return null;
  return guild.roles.cache.find(r => r.name.trim().toLowerCase() === name.trim().toLowerCase());
}

function computeAutoTag(credits) {
  let current = TAG_THRESHOLDS[0].tag;
  for (const t of TAG_THRESHOLDS) if (credits >= t.min) current = t.tag;
  return current;
}

// 🔹 AUTO PERFORMANCE TAG
function getPerformanceTag(userId) {
  const stats = data.performance[userId] || { tag: PERF_TAGS.start };
  const credits = data.credits[userId] || 0;
  const warns = (data.warns[userId] || []).length;
  const lastActive = data.lastActive[userId] || 0;
  const daysActive = (Date.now() - lastActive) / (1000 * 86400);

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
  data.performance[userId] ??= { tag: PERF_TAGS.start };
  saveData(data);
}

// ---------- Commands & Config ----------
const commands = [
  'addcredits', 'ban', 'break', 'createtag', 'demote', 'feedback', 'kick',
  'majorwarn', 'minorwarn', 'modoftheday', 'mute', 'profile', 'progress',
  'rankmod', 'rankup', 'removecredits', 'roster', 'setpfp', 'settag', 'setup',
  'trainingrp', 'unbreak', 'warn'
];
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

// ---------- 📝 MULTIPLE CHOICE TRAINING ----------
const quiz = [
  {
    q: 'What is the correct action for NSFW content?',
    options: ['A: 1 hour timeout', 'B: 1 day timeout', 'C: Permanent ban', 'D: Warning only'],
    answer: 'B',
    rule: 'Rule 1 → NSFW = 1 day timeout'
  },
  {
    q: 'How do you handle spam?',
    options: ['A: Kick', 'B: 10 min timeout', 'C: 60 second timeout', 'D: Ban'],
    answer: 'C',
    rule: 'Rule 2 → Spam = 60s timeout'
  },
  {
    q: 'What is the punishment for racism?',
    options: ['A: Warning', 'B: 5 minute timeout', 'C: 1 hour timeout', 'D: Kick'],
    answer: 'B',
    rule: 'Rule 5 → Racism = 5m timeout'
  },
  {
    q: 'Raiding results in?',
    options: ['A: 1 week timeout', 'B: Kick', 'C: Permanent ban', 'D: Warning'],
    answer: 'C',
    rule: 'Rule 7 → Raid = Permaban'
  },
  {
    q: 'Bullying is punished with?',
    options: ['A: 1 hour timeout', 'B: 5m timeout', 'C: Ban', 'D: Mute only'],
    answer: 'A',
    rule: 'Rule 6 → Bullying = 1h timeout'
  }
];

function shuffle(arr) { const c=[...arr]; for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];} return c; }
const activeSessions = new Set();
function recordTrainingResult(id, correct) {
  const s = data.trainingStats[id]||{taken:0,correct:0}; s.taken++; if(correct)s.correct++;
  data.trainingStats[id]=s; saveData(data);
}

// ---------- Core Systems ----------
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
      log?.send(newRank?`⬇️ ${member} demoted to ${newRank}`:`⚠️ ${member} max warnings`);
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
  await chan.send(`📚 **Surprise Training!**\n${q.q}\n${q.options.join('\n')}\nAnswer with A/B/C/D in 60s`);
  try{
    const collected=await chan.awaitMessages({filter:m=>!m.bot&&data.ranks[m.author.id],max:1,time:AUTO_TRAIN_ANSWER_WINDOW_MS,errors:['time']});
    const ans=collected.first(); const ok=ans.content.trim().toUpperCase()===q.answer;
    recordTrainingResult(ans.author.id,ok);
    if(ok){ addCredits(ans.author.id,CREDIT_REWARDS.correctAnswer); chan.send(`✅ Correct! ${q.rule}`); }
    else chan.send(`❌ Wrong! Answer: ${q.answer} — ${q.rule}`);
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
  catch { return message.reply('❌ Failed to timeout'); }
  data.warns[target.id] ??= [];
  data.warns[target.id].push({ type, by:message.author.id, at:Date.now() });
  updateTag(target.id); saveData(data);
  message.reply(`${target} → **${type}**`);
  getLogChannel(message.guild)?.send(`📋 ${target} got ${type}`);
}

// ---------- Ready & Events ----------
client.once('ready', () => {
  const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();
  if(guild){
    setInterval(()=>checkInactivity(guild),CHECK_INTERVAL_MS);
    setInterval(()=>pickModeratorOfTheDay(guild),CHECK_INTERVAL_MS);
    scheduleNextAutoTraining(guild);
  }
  console.log('✅ Bot Ready — Role detection & Performance Tags ON');
});

client.on('messageCreate', async message => {
  if(message.author.bot||!message.guild||!message.content.startsWith(PREFIX)) return;
  const args=message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command=args.shift()?.toLowerCase();
  if(commands.includes(command)) markActive(message.author.id);
  if(RANK_REQUIREMENTS[command]!==undefined&&!hasRequiredRank(message.author.id,command)){
    const reqName=RANK_LADDER[RANK_REQUIREMENTS[command]].name;
    return message.reply(`🚫 Need **${reqName}**+`);
  }

  // 🔹 SETUP COMMAND
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

  if(command==='help'){
    const list=[...commands].sort().join('\n  ');
    return message.reply(`\`\`\`\nPrefix: ${PREFIX}\nCommands:\n  ${list}\n\`\`\``);
  }

  if(command==='break'){
    if(getRankIndex(message.author.id)<0) return message.reply('❌ Not mod');
    data.onBreak[message.author.id]=Date.now(); saveData(data);
    message.reply('🌴 Break ON');
    return;
  }
  if(command==='unbreak'){
    delete data.onBreak[message.author.id]; markActive(message.author.id); saveData(data);
    message.reply('👋 Back active');
    return;
  }

  if(command==='rankmod'){
    const target=message.mentions.members.first();
    if(!target) return message.reply(`Use: ${PREFIX}rankmod @user`);
    if(getRankIndex(target.id)>=0) return message.reply('❌ Already mod');
    const trialRole=findRoleByName(message.guild, 'Trial Moderator');
    if(!trialRole) return message.reply('❌ Role "Trial Moderator" not found');
    try {
      await target.roles.add(trialRole);
      data.ranks[target.id]=0; data.credits[target.id]=0;
      data.performance[target.id]={tag:'Good'}; // START GOOD
      updateTag(target.id); saveData(data);
      message.reply(`✅ ${target} → Trial Moderator | **Good**`);
    }catch(e){ message.reply('❌ Permissions error'); }
    return;
  }

  if(command==='feedback'){
    const text=args.join(' ').trim();
    if(!text) return message.reply(`Use: ${PREFIX}feedback text`);
    const embed=new EmbedBuilder().setTitle('📝 Feedback').setDescription(text)
      .addFields({name:'From',value:message.author.tag}).setColor(0x3498DB);
    getLogChannel(message.guild)?.send({embeds:[embed]});
    data.feedbacks.push({from:message.author.id,text,at:Date.now()}); saveData(data);
    message.reply('✅ Sent');
    return;
  }

  if(command==='addcredits'||command==='removecredits'){
    const target=message.mentions.members.first();
    const amt=parseInt(args[1]); if(!target||isNaN(amt)) return message.reply(`Use: ${PREFIX}${command} @user N`);
    addCredits(target.id, command==='addcredits'?amt:-amt);
    message.reply(`${target.tag}: ${data.credits[target.id]} credits`);
    return;
  }

  if(['warn','minorwarn','majorwarn'].includes(command)){ await applyWarn(message,command); return; }

  if(['mute','kick','ban'].includes(command)){
    const target=message.mentions.members.first(); if(!target) return message.reply(`Use: ${PREFIX}${command} @user`);
    try{
      if(command==='mute') await target.timeout(10*60*1000);
      if(command==='kick') await target.kick();
      if(command==='ban') await target.ban({reason:`By ${message.author.tag}`});
      addCredits(message.author.id,CREDIT_REWARDS[command]);
      message.reply(`✅ ${command} | +${CREDIT_REWARDS[command]}cr`);
    }catch{ message.reply('❌ Failed'); }
    return;
  }

  if(command==='settag'){
    const target=message.mentions.members.first()||message.member;
    if(target.id!==message.author.id&&getRankIndex(message.author.id)<3) return message.reply('❌ Need Head Mod+');
    const txt=args.slice(target?1:0).join(' ').trim(); if(!txt) return message.reply(`Use: ${PREFIX}settag [@user] text`);
    data.tags[target.id]={text:txt,manual:true}; saveData(data);
    message.reply(`✅ Tag set`);
    return;
  }

  if(command==='profile'){
    const target=message.mentions.members.first()||message.member;
    const credits=data.credits[target.id]||0;
    const rankName=RANK_LADDER[getRankIndex(target.id)]?.name||'—';
    const tag=data.tags[target.id]?.text||computeAutoTag(credits);
    const perf=getPerformanceTag(target.id);
    const embed=new EmbedBuilder().setTitle(`${target.user.tag}`)
      .addFields(
        {name:'Rank',value:rankName,inline:true},
        {name:'Tag',value:tag,inline:true},
        {name:'Performance',value:perf,inline:true},
        {name:'Credits',value:`${credits}`,inline:true},
        {name:'Warns',value:`${(data.warns[target.id]||[]).length}`,inline:true}
      )
      .setColor(0x5865F2);
    message.reply({embeds:[embed]});
    getProfileChannel(message.guild)?.send({embeds:[embed]});
    return;
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
    message.reply({embeds:[embed]});
    return;
  }

  if(command==='demote'){
    const ok=getRankIndex(message.author.id)>=5||message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if(!ok) return message.reply('❌ No permission');
    const target=message.mentions.members.first(); if(!target) return message.reply(`Use: ${PREFIX}demote @user`);
    const newRank=await demoteMember(message.guild,target);
    message.reply(newRank?`✅ ${target} → ${newRank}`:'❌ Failed');
    return;
  }

  if(command==='rankup'){
    const idx=getRankIndex(message.author.id);
    const next=RANK_LADDER[idx+1]; if(!next) return message.reply('✅ Max rank');
    if((data.credits[message.author.id]||0)<next.cost) return message.reply(`❌ Need ${next.cost} credits`);
    const currRole=findRoleByName(message.guild,RANK_LADDER[idx].name);
    const nextRole=findRoleByName(message.guild,next.name);
    try{ if(currRole) await message.member.roles.remove(currRole); if(nextRole) await message.member.roles.add(nextRole); }
    catch{ return message.reply('❌ Role hierarchy issue'); }
    data.credits[message.author.id]-=next.cost; data.ranks[message.author.id]=idx+1; updateTag(message.author.id); saveData(data);
    message.reply(`🎉 → ${next.name}`);
    return;
  }

  if(command==='trainingrp'){
    if(activeSessions.has(message.author.id)) return message.reply('❌ In progress');
    activeSessions.add(message.author.id);
    let score=0; const qs=shuffle(quiz);
    await message.reply(`📘 Training — answer A/B/C/D`);
    for(const q of qs){
      await message.channel.send(`\n${q.q}\n${q.options.join('\n')}`);
      try{
        const coll=await message.channel.awaitMessages({filter:m=>m.author.id===message.author.id,max:1,time:30000});
        const ok=coll.first().content.trim().toUpperCase()===q.answer;
        if(ok){ score++; addCredits(message.author.id,CREDIT_REWARDS.correctAnswer); await message.channel.send(`✅ ${q.rule}`); }
        else await message.channel.send(`❌ ${q.rule}`);
      }catch{ await message.channel.send(`⏱️ ${q.rule}`); }
    }
    activeSessions.delete(message.author.id);
    await message.channel.send(`🏁 Score: ${score}/${qs.length}`);
    return;
  }
});

client.login(process.env.BOT_TOKEN);