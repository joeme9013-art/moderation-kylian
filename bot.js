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
const AUTO_TRAINING_CHANNEL_ID = '1528327903371202653'; // ✅ UPDATED

const INACTIVITY_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_INACTIVITY_WARNS = 3;
const MOD_OF_DAY_BONUS = 50;
const AUTO_TRAIN_ANSWER_WINDOW_MS = 60 * 1000;
const AUTO_TRAIN_MIN_GAP_MS = 12 * 60 * 60 * 1000;
const AUTO_TRAIN_MAX_GAP_MS = 30 * 60 * 60 * 1000;

// ---------- Data ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      credits: {}, warns: {}, tags: {}, ranks: {}, lastActive: {},
      inactivityWarns: {}, config: {}, dailyCredits: {}, pfps: {},
      onBreak: {}, trainingStats: {},
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.lastActive ??= {}; parsed.inactivityWarns ??= {}; parsed.config ??= {};
  parsed.dailyCredits ??= {}; parsed.pfps ??= {}; parsed.onBreak ??= {};
  parsed.trainingStats ??= {};
  return parsed;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

function getLogChannel(guild) {
  const id = data.config.logChannelId || DEFAULT_LOG_CHANNEL_ID;
  return guild.channels.cache.get(id);
}

// ---------- Commands & Credits ----------
const commands = [
  'addcredits', 'ban', 'break', 'createtag', 'demote', 'feedback', 'kick',
  'majorwarn', 'minorwarn', 'modoftheday', 'mute', 'profile', 'progress',
  'rankup', 'removecredits', 'roster', 'setpfp', 'settag', 'setup',
  'trainingrp', 'unbreak', 'warn',
];
const CREDIT_REWARDS = { mute: 10, kick: 20, ban: 30, correctAnswer: 5 };
function addCredits(userId, amount) {
  data.credits[userId] = Math.max(0, (data.credits[userId] || 0) + amount);
  data.dailyCredits[userId] = (data.dailyCredits[userId] || 0) + amount;
  updateTag(userId); saveData(data);
}
function markActive(userId) {
  data.lastActive[userId] = Date.now();
  if (data.inactivityWarns[userId]) data.inactivityWarns[userId] = 0;
  saveData(data);
}

// ---------- Auto Tags ----------
const TAG_THRESHOLDS = [
  { min: 0, tag: 'New Moderator' }, { min: 100, tag: 'Reliable Moderator' },
  { min: 300, tag: 'Trusted Moderator' }, { min: 700, tag: 'Elite Moderator' },
  { min: 1500, tag: 'Legendary Moderator' },
];
function computeAutoTag(credits) {
  let current = TAG_THRESHOLDS[0].tag;
  for (const t of TAG_THRESHOLDS) if (credits >= t.min) current = t.tag;
  return current;
}
function updateTag(userId) {
  if (data.tags[userId]?.manual) return;
  data.tags[userId] = { text: computeAutoTag(data.credits[userId]||0), manual: false };
}

// ---------- Rank System ----------
const RANK_LADDER = [
  { name: 'Trial Moderator', cost: 0 }, { name: 'Moderator', cost: 50 },
  { name: 'Senior Moderator', cost: 150 }, { name: 'Head Moderator', cost: 300 },
  { name: 'Trial Admin', cost: 500 }, { name: 'Admin', cost: 750 },
  { name: 'Senior Admin', cost: 1050 }, { name: 'Head Admin', cost: 1400 },
  { name: 'Assistant Server Manager', cost: 1700 }, { name: 'Server Manager', cost: 2000 },
];
function getRankIndex(userId) { return data.ranks[userId] ?? -1; }
function findRoleByName(guild, name) { return guild.roles.cache.find(r => r.name === name); }
const RANK_REQUIREMENTS = { mute:0, warn:0, minorwarn:0, kick:1, majorwarn:1, ban:2, demote:5, addcredits:5, removecredits:5 };
function hasRequiredRank(userId, cmd) {
  const req = RANK_REQUIREMENTS[cmd];
  return req === undefined ? true : getRankIndex(userId) >= req;
}

// ---------- Warn System ----------
const WARN_DURATIONS = { warn:2, minorwarn:1, majorwarn:3 };
const WEEK_MS = 7*24*60*60*1000;
async function applyWarn(message, type) {
  const target = message.mentions.members.first();
  if (!target) return message.reply(`Use: ${PREFIX}${type} @user`);
  const ms = WARN_DURATIONS[type] * WEEK_MS;
  try { await target.timeout(ms, `${type} by ${message.author.tag}`); }
  catch { return message.reply('Failed to timeout — check permissions.'); }
  data.warns[target.id] ??= [];
  data.warns[target.id].push({ type, by:message.author.id, at:Date.now(), expiresAt:Date.now()+ms });
  saveData(data);
  message.reply(`${target} → **${type}** (${WARN_DURATIONS[type]}w timeout)`);
  getLogChannel(message.guild)?.send(`📋 ${target} got ${type} from ${message.author}`);
}

// ---------- Demote ----------
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

// ---------- Quiz ----------
const quiz = [
  { q:'1) NSFW content?', a:'1 day timeout', rule:'Rule1: NSFW → 1d timeout' },
  { q:'2) Spam?', a:'60 second timeout', rule:'Rule2: Spam → 60s' },
  { q:'3) Illegal politics?', a:'1 day timeout', rule:'Rule3: Illegal politics →1d' },
  { q:'4) Who can swear?', a:'the designated role', rule:'Rule4: Only <@&1397351950122750032>' },
  { q:'5) Racism?', a:'5 minute timeout', rule:'Rule5: Racism →5m' },
  { q:'6) Bullying?', a:'1 hour timeout', rule:'Rule6: Bullying →1h' },
  { q:'7) Raiding?', a:'permanent ban', rule:'Rule7: Raid →permaban' },
  { q:'8) Rule 8?', a:'be friendly', rule:'Rule8: Be friendly' },
  { q:'9) Never share/ask for?', a:'private information', rule:'Rule9: No private info' },
  { q:'10) Gore?', a:'60 second timeout', rule:'Rule11: Gore →60s' },
  { q:'11) Freaky/weird?', a:'5 minute timeout', rule:'Rule12: Weird →5m' },
  { q:'12) Impersonation?', a:'kicked', rule:'Rule13: Impersonate →kick' },
  { q:'13) Info leak?', a:'permanent ban or 1 week timeout', rule:'Rule14: Leak →permaban/1w' },
  { q:'14) Manipulate owner?', a:'permanent ban, no exceptions', rule:'Rule15: Manipulate →permaban' },
  { q:'15) No @everyone/@here because?', a:'it might wake people up who are sleeping', rule:'Rule16: No mass pings' },
];
function shuffle(arr) { const c=[...arr]; for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];} return c; }
const activeSessions = new Set();
function recordTrainingResult(id, correct) {
  const s = data.trainingStats[id]||{taken:0,correct:0}; s.taken++; if(correct)s.correct++;
  data.trainingStats[id]=s; saveData(data);
}

// ---------- Inactivity ----------
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

// ---------- Mod of Day ----------
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

// ---------- Auto Training ----------
async function runAutoTraining(guild) {
  const chan=guild.channels.cache.get(AUTO_TRAINING_CHANNEL_ID); if(!chan) return;
  const q=quiz[Math.floor(Math.random()*quiz.length)];
  await chan.send(`📚 **Surprise Training!**\n${q.q}\n60s to answer`);
  try{
    const collected=await chan.awaitMessages({filter:m=>!m.bot&&data.ranks[m.author.id],max:1,time:AUTO_TRAIN_ANSWER_WINDOW_MS,errors:['time']});
    const ans=collected.first(); const ok=q.a.toLowerCase().split(' ').some(w=>w.length>3&&ans.content.toLowerCase().includes(w));
    recordTrainingResult(ans.author.id,ok);
    if(ok){ addCredits(ans.author.id,CREDIT_REWARDS.correctAnswer); chan.send(`✅ ${ans.author} — ${q.rule}`); }
    else chan.send(`❌ ${q.rule}`);
  }catch{ chan.send(`⏱️ Time up — ${q.rule}`); }
}
function scheduleNextAutoTraining(guild) {
  const gap=AUTO_TRAIN_MIN_GAP_MS+Math.random()*(AUTO_TRAIN_MAX_GAP_MS-AUTO_TRAIN_MIN_GAP_MS);
  setTimeout(async()=>{await runAutoTraining(guild); scheduleNextAutoTraining(guild);},gap);
}

client.once('ready', () => {
  const guild=client.guilds.cache.get(GUILD_ID)||client.guilds.cache.first();
  if(guild){
    setInterval(()=>checkInactivity(guild),CHECK_INTERVAL_MS);
    setInterval(()=>pickModeratorOfTheDay(guild),CHECK_INTERVAL_MS);
    scheduleNextAutoTraining(guild);
  }
  console.log('✅ Bot Ready');
});

// ---------- Main Command Handler ----------
client.on('messageCreate', async message => {
  if(message.author.bot||!message.guild||!message.content.startsWith(PREFIX)) return;
  const args=message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command=args.shift();
  if(commands.includes(command)) markActive(message.author.id);
  if(RANK_REQUIREMENTS[command]!==undefined&&!hasRequiredRank(message.author.id,command)){
    const reqName=RANK_LADDER[RANK_REQUIREMENTS[command]].name;
    return message.reply(`🚫 Need at least **${reqName}** for \`${PREFIX}${command}\`.`);
  }

  if(command==='help'){
    const list=[...commands].sort().join('\n  ');
    return message.reply(`\`\`\`\nPrefix: ${PREFIX}\nCommands:\n  ${list}\n\`\`\``);
  }

  if(command==='setup'){
    if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ Admin only.');
    if(args[0]==='logchannel'){
      const ch=message.mentions.channels.first();
      if(!ch) return message.reply(`Use: ${PREFIX}setup logchannel #channel`);
      data.config.logChannelId=ch.id; saveData(data);
      return message.reply(`✅ Logs → ${ch}`);
    }
    return message.reply(`Use: ${PREFIX}setup logchannel #channel`);
  }

  if(command==='break'){
    if(getRankIndex(message.author.id)<0) return message.reply('❌ Not on mod team.');
    if(data.onBreak[message.author.id]) return message.reply('❌ Already on break.');
    data.onBreak[message.author.id]=Date.now(); saveData(data);
    message.reply('🌴 Break started — inactivity paused. Use ?unbreak when back.');
    getLogChannel(message.guild)?.send(`🌴 ${message.author} went on break`);
    return;
  }

  if(command==='unbreak'){
    if(!data.onBreak[message.author.id]) return message.reply('❌ Not on break.');
    delete data.onBreak[message.author.id]; markActive(message.author.id); saveData(data);
    message.reply('👋 Welcome back!');
    getLogChannel(message.guild)?.send(`👋 ${message.author} ended break`);
    return;
  }

  if(command==='addcredits'||command==='removecredits'){
    const target=message.mentions.members.first();
    const amt=parseInt(args[1],10);
    if(!target||isNaN(amt)||amt<=0) return message.reply(`Use: ${PREFIX}${command} @user amount`);
    const delta=command==='addcredits'?amt:-amt;
    addCredits(target.id,delta);
    message.reply(`${command}: ${target.user.tag} → ${data.credits[target.id]||0} credits`);
    getLogChannel(message.guild)?.send(`💳 ${message.author} ${command} ${amt} → ${target}`);
    return;
  }

  if(['warn','minorwarn','majorwarn'].includes(command)){
    await applyWarn(message,command);
    return;
  }

  if(['mute','kick','ban'].includes(command)){
    const target=message.mentions.members.first();
    if(!target) return message.reply(`Use: ${PREFIX}${command} @user`);
    try{
      if(command==='mute') await target.timeout(10*60*1000,`${command} by ${message.author.tag}`);
      if(command==='kick') await target.kick(`${command} by ${message.author.tag}`);
      if(command==='ban') await target.ban({reason:`${command} by ${message.author.tag}`});
      addCredits(message.author.id,CREDIT_REWARDS[command]);
      message.reply(`✅ ${target.user.tag} ${command}d. +${CREDIT_REWARDS[command]} credits`);
    }catch{
      message.reply('❌ Failed — check permissions/role position.');
    }
    return;
  }

  if(command==='settag'){
    const target=message.mentions.members.first()||message.member;
    if(target.id!==message.author.id&&getRankIndex(message.author.id)<3)
      return message.reply('🚫 Need Head Mod+ to edit others.');
    const newTag=message.mentions.members.first()?args.slice(1).join(' ').trim():args.join(' ').trim();
    if(!newTag) return message.reply(`Use: ${PREFIX}settag [@user] text`);
    data.tags[target.id]={text:newTag,manual:true}; saveData(data);
    message.reply(`✅ ${target} tag → **${newTag}**`);
    getLogChannel(message.guild)?.send(`🏷️ ${message.author} set ${target} tag: ${newTag}`);
    return;
  }

  if(command==='setpfp'){
    const url=args[0];
    if(!url||!/^https?:\/\/.+\.(gif|png|jpg|jpeg|webp)$/i.test(url))
      return message.reply(`Use: ${PREFIX}setpfp <image link>`);
    data.pfps[message.author.id]=url; saveData(data);
    message.reply('✅ Profile image set.');
    return;
  }

  if(command==='profile'){
    const target=message.mentions.members.first()||message.member;
    const credits=data.credits[target.id]||0;
    const tag=data.tags[target.id]?.text||computeAutoTag(credits);
    const rankIndex=getRankIndex(target.id);
    const rankName=rankIndex>=0?RANK_LADDER[rankIndex].name:'Not on team';
    const warnCount=(data.warns[target.id]||[]).length;
    const inactiveWarn=data.inactivityWarns[target.id]||0;
    const pfp=data.pfps[target.id];
    const onBreak=!!data.onBreak[target.id];

    const embed=new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Profile`)
      .addFields(
        {name:'Rank',value:rankName,inline:true},
        {name:'Tag',value:tag,inline:true},
        {name:'Credits',value:`${credits}`,inline:true},
        {name:'Warns',value:`${warnCount}`,inline:true},
        {name:'Inactivity Warns',value:`${inactiveWarn}/${MAX_INACTIVITY_WARNS}`,inline:true},
        {name:'Status',value:onBreak?'🌴 Break':'✅ Active',inline:true}
      )
      .setColor(0x5865F2);
    if(pfp) embed.setImage(pfp);
    message.reply({embeds:[embed]});
    return;
  }

  if(command==='progress'){
    const target=message.mentions.members.first()||message.member;
    const stats=data.trainingStats[target.id]||{taken:0,correct:0};
    const pct=stats.taken?Math.round((stats.correct/stats.taken)*100):0;
    const embed=new EmbedBuilder()
      .setTitle(`${target.user.tag}'s Training`)
      .addFields(
        {name:'Taken',value:`${stats.taken}`,inline:true},
        {name:'Correct',value:`${stats.correct}`,inline:true},
        {name:'Accuracy',value:`${pct}%`,inline:true}
      )
      .setColor(0x9B59B6);
    message.reply({embeds:[embed]});
    return;
  }

  if(command==='roster'){
    const guild=message.guild;
    const grouped={}; RANK_LADDER.forEach(r=>grouped[r.name]=[]);
    for(const [uid,rankIdx] of Object.entries(data.ranks)){
      const rName=RANK_LADDER[rankIdx]?.name; if(!rName) continue;
      const m=await guild.members.fetch(uid).catch(()=>null); if(!m) continue;
      const tag=data.tags[uid]?.text||computeAutoTag(data.credits[uid]||0);
      const brk=data.onBreak[uid]?' 🌴':'';
      grouped[rName].push(`${m.user.tag} — *${tag}*${brk}`);
    }
    const embed=new EmbedBuilder().setTitle('📋 Mod Roster').setColor(0x2ECC71);
    [...RANK_LADDER].reverse().forEach(r=>{
      if(grouped[r.name].length) embed.addFields({name:r.name,value:grouped[r.name].join('\n')});
    });
    message.reply({embeds:[embed]});
    return;
  }

  if(command==='modoftheday'){
    if(!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
      return message.reply('❌ Admin only.');
    await pickModeratorOfTheDay(message.guild);
    message.reply('✅ Mod of the Day announced.');
    return;
  }

  if(command==='demote'){
    const ok=hasRequiredRank(message.author.id,'demote')||message.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if(!ok) return message.reply(`🚫 Need ${RANK_LADDER[RANK_REQUIREMENTS.demote].name}+`);
    const target=message.mentions.members.first(); if(!target) return message.reply(`Use: ${PREFIX}demote @user`);
    const newRank=await demoteMember(message.guild,target);
    message.reply(newRank?`✅ ${target} → ${newRank}`:'❌ Failed');
    if(newRank) getLogChannel(message.guild)?.send(`⬇️ ${message.author} demoted ${target} → ${newRank}`);
    return;
  }

  if(command==='rankup'){
    const userId=message.author.id;
    const guild=message.guild;
    const currIdx=getRankIndex(userId);
    const nextIdx=currIdx+1;
    if(currIdx<0) return message.reply('❌ Not on mod team.');
    if(nextIdx>=RANK_LADDER.length) return message.reply('✅ Already max rank.');
    const nextRank=RANK_LADDER[nextIdx];
    const credits=data.credits[userId]||0;
    if(credits<nextRank.cost) return message.reply(`❌ Need ${nextRank.cost} credits (you have ${credits})`);
    const currRole=findRoleByName(guild,RANK_LADDER[currIdx].name);
    const nextRole=findRoleByName(guild,nextRank.name);
    if(!nextRole) return message.reply(`❌ Role "${nextRank.name}" not found`);
    try{
      if(currRole) await message.member.roles.remove(currRole);
      await message.member.roles.add(nextRole);
    }catch{ return message.reply('❌ Role update failed — check bot permissions/hierarchy'); }
    data.credits[userId]=credits-nextRank.cost;
    data.ranks[userId]=nextIdx;
    updateTag(userId); saveData(data);
    message.reply(`🎉 Promoted to **${nextRank.name}**! Remaining: ${data.credits[userId]}`);
    getLogChannel(guild)?.send(`⬆️ ${message.author} → ${nextRank.name}`);
    return;
  }

  if(command==='trainingrp'){
    if(activeSessions.has(message.author.id)) return message.reply('❌ Session in progress.');
    activeSessions.add(message.author.id);
    let score=0;
    const shuffled=shuffle(quiz);
    await message.reply(`📘 Training (${shuffled.length} questions, 30s each)`);
    for(const item of shuffled){
      await message.channel.send(item.q);
      try{
        const collected=await message.channel.awaitMessages({filter:m=>m.author.id===message.author.id,max:1,time:30000,errors:['time']});
        const ans=collected.first();
        const ok=item.a.toLowerCase().split(' ').some(w=>w.length>3&&ans.content.toLowerCase().includes(w));
        recordTrainingResult(message.author.id,ok);
        if(ok){ score++; addCredits(message.author.id,CREDIT_REWARDS.correctAnswer); await message.channel.send(`✅ ${item.rule} (+${CREDIT_REWARDS.correctAnswer})`); }
        else await message.channel.send(`❌ ${item.rule}`);
      }catch{
        recordTrainingResult(message.author.id,false);
        await message.channel.send(`⏱️ Time up — ${item.rule}`);
      }
    }
    activeSessions.delete(message.author.id);
    await message.channel.send(`🏁 Done! Score: ${score}/${shuffled.length}`);
    return;
  }
});

client.login(process.env.BOT_TOKEN);