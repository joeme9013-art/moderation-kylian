require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder,
  SlashCommandBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds], // buttons/modals/slash commands don't need privileged intents
});

const GUILD_ID = '1324059331406069872';
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';

// ---------- Persistence ----------
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      config: { spawnChannelId: null },
      activeSpawn: null,
      collections: {},   // userId -> { eventId -> { count, power, level } }
      upgradePoints: {}, // userId -> number
      battleStats: {},   // userId -> { wins, losses }
    };
  }
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  parsed.config ??= { spawnChannelId: null };
  parsed.activeSpawn ??= null;
  parsed.collections ??= {};
  parsed.upgradePoints ??= {};
  parsed.battleStats ??= {};
  return parsed;
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let data = loadData();

// ============================================================
// RARITY TIERS — Copper through Legendary, lowest to highest
// ============================================================
const RARITY_TIERS = [
  { name: 'Copper', frame: '🟤', weight: 40, color: 0xb87333, multiplier: 1 },
  { name: 'Iron', frame: '⚙️', weight: 25, color: 0x43464b, multiplier: 1.3 },
  { name: 'Bronze', frame: '🥉', weight: 16, color: 0xcd7f32, multiplier: 1.7 },
  { name: 'Gold', frame: '🥇', weight: 10, color: 0xffd700, multiplier: 2.3 },
  { name: 'Diamond', frame: '💎', weight: 5, color: 0xb9f2ff, multiplier: 3.2 },
  { name: 'Emerald', frame: '💚', weight: 2.5, color: 0x50c878, multiplier: 4.5 },
  { name: 'Sapphire', frame: '🔷', weight: 1.2, color: 0x0f52ba, multiplier: 6 },
  { name: 'Mythic', frame: '🔮', weight: 0.25, color: 0xff00ff, multiplier: 9 },
  { name: 'Legendary', frame: '👑', weight: 0.05, color: 0xffa500, multiplier: 14 },
];
function getRarity(name) {
  return RARITY_TIERS.find((r) => r.name === name);
}

// ============================================================
// HISTORICAL EVENT POOL — wars, treaties, and turning points,
// Roman Empire through the 20th century. "Flags" use modern national
// flags as geographic stand-ins for ancient/medieval powers where no
// contemporary flag existed.
// ============================================================
const HISTORICAL_EVENTS = [
  { id: 'punic-wars', name: 'The Punic Wars', era: 'Ancient Rome (264–146 BC)', flags: '🇮🇹 vs 🇹🇳', rarity: 'Gold',
    aliases: ['punic wars', 'punic war', 'rome vs carthage', 'the punic wars'] },
  { id: 'battle-of-actium', name: 'Battle of Actium', era: 'Ancient Rome (31 BC)', flags: '🇮🇹 vs 🇪🇬', rarity: 'Bronze',
    aliases: ['battle of actium', 'actium'] },
  { id: 'sack-of-rome-410', name: 'Sack of Rome', era: 'Late Antiquity (410 AD)', flags: '🇮🇹 ⚔️', rarity: 'Iron',
    aliases: ['sack of rome', 'sack of rome 410', 'visigoth sack of rome'] },
  { id: 'battle-of-hastings', name: 'Battle of Hastings', era: 'Medieval (1066)', flags: '🇬🇧 vs 🇫🇷', rarity: 'Bronze',
    aliases: ['battle of hastings', 'hastings', 'norman conquest'] },
  { id: 'treaty-of-verdun', name: 'Treaty of Verdun', era: 'Medieval (843 AD)', flags: '🇫🇷 🇩🇪 🇮🇹', rarity: 'Iron',
    aliases: ['treaty of verdun', 'verdun treaty', 'partition of the carolingian empire'] },
  { id: 'first-crusade', name: 'The First Crusade', era: 'Medieval (1096–1099)', flags: '🇻🇦 vs ☪️', rarity: 'Gold',
    aliases: ['first crusade', 'the first crusade', 'crusade of 1096'] },
  { id: 'hundred-years-war', name: "The Hundred Years' War", era: 'Medieval (1337–1453)', flags: '🇫🇷 vs 🇬🇧', rarity: 'Gold',
    aliases: ["hundred years war", "the hundred years war", "100 years war"] },
  { id: 'treaty-of-tordesillas', name: 'Treaty of Tordesillas', era: 'Renaissance (1494)', flags: '🇪🇸 🇵🇹', rarity: 'Bronze',
    aliases: ['treaty of tordesillas', 'tordesillas'] },
  { id: 'spanish-armada', name: 'The Spanish Armada', era: 'Renaissance (1588)', flags: '🇪🇸 vs 🇬🇧', rarity: 'Bronze',
    aliases: ['spanish armada', 'the spanish armada'] },
  { id: 'peace-of-westphalia', name: 'Peace of Westphalia', era: 'Early Modern (1648)', flags: '🇩🇪 🇫🇷 🇸🇪 🇪🇸', rarity: 'Gold',
    aliases: ['peace of westphalia', 'treaty of westphalia', 'westphalia'] },
  { id: 'seven-years-war', name: "The Seven Years' War", era: 'Early Modern (1756–1763)', flags: '🇬🇧 🇵🇱 vs 🇫🇷 🇦🇹 🇷🇺', rarity: 'Gold',
    aliases: ['seven years war', "the seven years' war"] },
  { id: 'american-revolution', name: 'The American Revolutionary War', era: 'Early Modern (1775–1783)', flags: '🇺🇸 vs 🇬🇧', rarity: 'Diamond',
    aliases: ['american revolutionary war', 'american revolution', 'revolutionary war'] },
  { id: 'treaty-of-paris-1783', name: 'Treaty of Paris (1783)', era: 'Early Modern (1783)', flags: '🇺🇸 🇬🇧', rarity: 'Bronze',
    aliases: ['treaty of paris 1783', 'treaty of paris'] },
  { id: 'french-revolution', name: 'The French Revolution', era: 'Modern (1789–1799)', flags: '🇫🇷', rarity: 'Diamond',
    aliases: ['french revolution', 'the french revolution'] },
  { id: 'napoleonic-wars', name: 'The Napoleonic Wars', era: 'Modern (1803–1815)', flags: '🇫🇷 vs 🇬🇧 🇷🇺 🇦🇹 🇵🇱', rarity: 'Diamond',
    aliases: ['napoleonic wars', 'the napoleonic wars'] },
  { id: 'congress-of-vienna', name: 'Congress of Vienna', era: 'Modern (1815)', flags: '🇦🇹 🇬🇧 🇷🇺 🇵🇱 🇫🇷', rarity: 'Gold',
    aliases: ['congress of vienna'] },
  { id: 'crimean-war', name: 'The Crimean War', era: 'Modern (1853–1856)', flags: '🇷🇺 vs 🇬🇧 🇫🇷 🇹🇷', rarity: 'Bronze',
    aliases: ['crimean war', 'the crimean war'] },
  { id: 'franco-prussian-war', name: 'The Franco-Prussian War', era: 'Modern (1870–1871)', flags: '🇫🇷 vs 🇩🇪', rarity: 'Bronze',
    aliases: ['franco prussian war', 'franco-prussian war'] },
  { id: 'treaty-of-versailles', name: 'Treaty of Versailles', era: 'Modern (1919)', flags: '🇩🇪 🇫🇷 🇬🇧 🇺🇸', rarity: 'Diamond',
    aliases: ['treaty of versailles', 'versailles'] },
  { id: 'world-war-1', name: 'World War I', era: 'Modern (1914–1918)', flags: '🇩🇪 🇦🇹 vs 🇬🇧 🇫🇷 🇷🇺 🇺🇸', rarity: 'Emerald',
    aliases: ['world war 1', 'world war i', 'wwi', 'the great war', 'first world war'] },
  { id: 'world-war-2', name: 'World War II', era: 'Modern (1939–1945)', flags: '🇩🇪 🇮🇹 🇯🇵 vs 🇬🇧 🇺🇸 🇫🇷 🇷🇺', rarity: 'Legendary',
    aliases: ['world war 2', 'world war ii', 'wwii', 'second world war'] },
  { id: 'treaty-of-san-francisco', name: 'Treaty of San Francisco', era: 'Modern (1951)', flags: '🇯🇵 🇺🇸', rarity: 'Iron',
    aliases: ['treaty of san francisco', 'san francisco treaty'] },
  { id: 'korean-war', name: 'The Korean War', era: 'Modern (1950–1953)', flags: '🇰🇷 🇺🇸 vs 🇰🇵 🇨🇳', rarity: 'Gold',
    aliases: ['korean war', 'the korean war'] },
  { id: 'cuban-missile-crisis', name: 'The Cuban Missile Crisis', era: 'Modern (1962)', flags: '🇺🇸 vs 🇷🇺 🇨🇺', rarity: 'Sapphire',
    aliases: ['cuban missile crisis', 'the cuban missile crisis'] },
  { id: 'fall-of-berlin-wall', name: 'Fall of the Berlin Wall', era: 'Modern (1989)', flags: '🇩🇪', rarity: 'Diamond',
    aliases: ['fall of the berlin wall', 'berlin wall', 'fall of berlin wall'] },
  { id: 'camp-david-accords', name: 'Camp David Accords', era: 'Modern (1978)', flags: '🇪🇬 🇮🇱 🇺🇸', rarity: 'Bronze',
    aliases: ['camp david accords', 'camp david'] },
  { id: 'gulf-war', name: 'The Gulf War', era: 'Modern (1990–1991)', flags: '🇮🇶 vs 🇺🇸 🇬🇧 🇫🇷 🇸🇦', rarity: 'Bronze',
    aliases: ['gulf war', 'the gulf war', 'operation desert storm'] },
  { id: 'treaty-of-maastricht', name: 'Treaty of Maastricht', era: 'Modern (1992)', flags: '🇪🇺', rarity: 'Iron',
    aliases: ['treaty of maastricht', 'maastricht treaty', 'maastricht'] },
  { id: 'good-friday-agreement', name: 'Good Friday Agreement', era: 'Modern (1998)', flags: '🇬🇧 🇮🇪', rarity: 'Bronze',
    aliases: ['good friday agreement', 'belfast agreement'] },
];
function findEventById(id) {
  return HISTORICAL_EVENTS.find((e) => e.id === id);
}
function findEventByName(name) {
  const norm = name.trim().toLowerCase();
  return HISTORICAL_EVENTS.find((e) => e.name.toLowerCase() === norm || e.aliases.includes(norm));
}
function matchesEvent(event, guess) {
  const norm = guess.trim().toLowerCase();
  return event.name.toLowerCase() === norm || event.aliases.includes(norm);
}

// ---------- Collection helpers ----------
function getCollection(userId) {
  data.collections[userId] = data.collections[userId] || {};
  return data.collections[userId];
}
function getUpgradePoints(userId) {
  return data.upgradePoints[userId] || 0;
}
function addUpgradePoints(userId, amount) {
  data.upgradePoints[userId] = (data.upgradePoints[userId] || 0) + amount;
}
function getBattleStats(userId) {
  data.battleStats[userId] = data.battleStats[userId] || { wins: 0, losses: 0 };
  return data.battleStats[userId];
}
function grantEvent(userId, eventId) {
  const event = findEventById(eventId);
  const rarity = getRarity(event.rarity);
  const collection = getCollection(userId);
  if (collection[eventId]) {
    collection[eventId].count += 1;
    addUpgradePoints(userId, 5); // duplicates convert to upgrade points instead of a second card
    saveData(data);
    return { isNew: false, entry: collection[eventId] };
  }
  const basePower = Math.round(50 * rarity.multiplier);
  collection[eventId] = { count: 1, power: basePower, level: 1 };
  saveData(data);
  return { isNew: true, entry: collection[eventId] };
}

// ---------- Weighted random event selection for spawns ----------
function pickWeightedEvent() {
  const weighted = HISTORICAL_EVENTS.map((e) => ({ event: e, weight: getRarity(e.rarity).weight }));
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;
  for (const w of weighted) {
    roll -= w.weight;
    if (roll <= 0) return w.event;
  }
  return weighted[weighted.length - 1].event;
}

// ============================================================
// SPAWNING
// ============================================================
const SPAWN_MIN_GAP_MS = 30 * 60 * 1000;   // 30 minutes
const SPAWN_MAX_GAP_MS = 3 * 60 * 60 * 1000; // 3 hours

function buildSpawnEmbed(event) {
  const rarity = getRarity(event.rarity);
  return new EmbedBuilder()
    .setTitle(`${rarity.frame} A Historical Event Has Appeared!`)
    .setDescription(
      `# ${event.flags}\n\n**Era:** ${event.era}\n\nGuess the war, treaty, or turning point these flags represent!`
    )
    .setColor(rarity.color)
    .setFooter({ text: 'First correct guess claims it for their collection.' });
}

async function spawnEvent(guild) {
  const channelId = data.config.spawnChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  const event = pickWeightedEvent();
  const token = `${Date.now()}${Math.floor(Math.random() * 10000)}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`guess_${token}`).setLabel('🔍 Guess').setStyle(ButtonStyle.Primary),
  );

  const message = await channel.send({ embeds: [buildSpawnEmbed(event)], components: [row] }).catch(() => null);
  if (!message) return;

  data.activeSpawn = { eventId: event.id, token, claimedBy: null, channelId, messageId: message.id };
  saveData(data);
}

function scheduleNextSpawn(guild) {
  const gap = SPAWN_MIN_GAP_MS + Math.random() * (SPAWN_MAX_GAP_MS - SPAWN_MIN_GAP_MS);
  setTimeout(async () => {
    await spawnEvent(guild);
    scheduleNextSpawn(guild);
  }, gap);
}

async function claimSpawn(interaction, guessText) {
  const spawn = data.activeSpawn;
  if (!spawn || spawn.claimedBy) {
    return { correct: false, alreadyClaimed: true };
  }
  const event = findEventById(spawn.eventId);
  if (!matchesEvent(event, guessText)) {
    return { correct: false, alreadyClaimed: false };
  }
  spawn.claimedBy = interaction.user.id;
  const result = grantEvent(interaction.user.id, event.id);
  saveData(data);

  // Update the original spawn message to show it's been claimed
  const channel = interaction.guild.channels.cache.get(spawn.channelId);
  const spawnMessage = channel ? await channel.messages.fetch(spawn.messageId).catch(() => null) : null;
  if (spawnMessage) {
    const rarity = getRarity(event.rarity);
    const claimedEmbed = EmbedBuilder.from(spawnMessage.embeds[0])
      .setTitle(`${rarity.frame} ${event.name} — Claimed!`)
      .setDescription(`${event.flags}\n\n**Era:** ${event.era}\n\nClaimed by ${interaction.user}!`);
    await spawnMessage.edit({ embeds: [claimedEmbed], components: [] }).catch(() => {});
  }

  data.activeSpawn = null;
  saveData(data);
  return { correct: true, event, isNew: result.isNew, entry: result.entry };
}

// ============================================================
// SLASH COMMAND DEFINITIONS
// ============================================================
const slashCommands = [
  new SlashCommandBuilder().setName('setspawnchannel').setDescription('Set where historical events spawn. Admin only.')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel for spawns').setRequired(true)),
  new SlashCommandBuilder().setName('forcespawn').setDescription('Manually spawn an event right now. Admin only.'),
  new SlashCommandBuilder().setName('collection').setDescription('View a collection of historical events.')
    .addUserOption((o) => o.setName('user').setDescription('Whose collection to view').setRequired(false)),
  new SlashCommandBuilder().setName('view').setDescription('View details of one collected event.')
    .addStringOption((o) => o.setName('event').setDescription('Event name').setRequired(true)),
  new SlashCommandBuilder().setName('upgrade').setDescription('Spend upgrade points to power up an event.')
    .addStringOption((o) => o.setName('event').setDescription('Event name to upgrade').setRequired(true)),
  new SlashCommandBuilder().setName('battle').setDescription('Stage a head-to-head battle between two historical events.')
    .addStringOption((o) => o.setName('your_event').setDescription('Your event').setRequired(true))
    .addUserOption((o) => o.setName('opponent').setDescription('Who to battle').setRequired(true))
    .addStringOption((o) => o.setName('opponent_event').setDescription("Opponent's event").setRequired(true)),
  new SlashCommandBuilder().setName('dex').setDescription('View the full historical event dex and your discovery progress.'),
  new SlashCommandBuilder().setName('progress').setDescription('View collection completion progress.')
    .addUserOption((o) => o.setName('user').setDescription('Whose progress to view').setRequired(false)),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top collectors by total historical power.'),
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
  if (guild) scheduleNextSpawn(guild);
});

// ============================================================
// INTERACTION HANDLER
// ============================================================
client.on('interactionCreate', async (interaction) => {
  try {
    // ---------- Button: opens the guess modal ----------
    if (interaction.isButton() && interaction.customId.startsWith('guess_')) {
      const token = interaction.customId.replace('guess_', '');
      if (!data.activeSpawn || data.activeSpawn.token !== token) {
        await interaction.reply({ content: 'This spawn has expired.', ephemeral: true });
        return;
      }
      if (data.activeSpawn.claimedBy) {
        await interaction.reply({ content: 'This one has already been claimed!', ephemeral: true });
        return;
      }
      const modal = new ModalBuilder().setCustomId(`guessmodal_${token}`).setTitle('Guess the Historical Event');
      const input = new TextInputBuilder()
        .setCustomId('guessInput')
        .setLabel('War, treaty, or event name')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. World War II')
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    // ---------- Modal submit: check the guess ----------
    if (interaction.isModalSubmit() && interaction.customId.startsWith('guessmodal_')) {
      const guessText = interaction.fields.getTextInputValue('guessInput');
      const result = await claimSpawn(interaction, guessText);

      if (result.alreadyClaimed) {
        await interaction.reply({ content: 'Too slow — someone already claimed this one!', ephemeral: true });
        return;
      }
      if (!result.correct) {
        await interaction.reply({ content: `❌ Not quite. Try again!`, ephemeral: true });
        return;
      }
      const rarity = getRarity(result.event.rarity);
      const embed = new EmbedBuilder()
        .setTitle(`${rarity.frame} Correct!`)
        .setDescription(
          `You identified **${result.event.name}**!\n\n` +
          (result.isNew
            ? `Added to your collection at **${rarity.name}** rarity.\nPower: **${result.entry.power}**`
            : `You already had this one — converted to **+5 upgrade points** instead.`)
        )
        .setColor(rarity.color);
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    const name = interaction.commandName;

    switch (name) {
      case 'help': {
        const out = '```\n' +
          'HISTORICALDEX COMMANDS:\n' +
          '  /collection [user]     — view a collection\n' +
          '  /view <event>          — view one event\'s details\n' +
          '  /upgrade <event>       — spend points to power up an event\n' +
          '  /battle <event> <opponent> <opponent_event> — head-to-head battle\n' +
          '  /dex                   — full event list + your discovery progress\n' +
          '  /progress [user]       — completion percentage\n' +
          '  /leaderboard           — top collectors\n' +
          '  /setspawnchannel #channel — (Admin) set spawn location\n' +
          '  /forcespawn            — (Admin) spawn one right now\n' +
          '```';
        await interaction.reply({ content: out, ephemeral: true });
        return;
      }

      case 'setspawnchannel': {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: 'Only server admins can set this.', ephemeral: true });
          return;
        }
        const channel = interaction.options.getChannel('channel');
        data.config.spawnChannelId = channel.id;
        saveData(data);
        await interaction.reply({ content: `✅ Historical events will now spawn in ${channel}.` });
        return;
      }

      case 'forcespawn': {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({ content: 'Only server admins can do this.', ephemeral: true });
          return;
        }
        if (!data.config.spawnChannelId) {
          await interaction.reply({ content: 'Set a spawn channel first with `/setspawnchannel`.', ephemeral: true });
          return;
        }
        await spawnEvent(interaction.guild);
        await interaction.reply({ content: '✅ Spawned.', ephemeral: true });
        return;
      }

      case 'collection': {
        const target = interaction.options.getUser('user') || interaction.user;
        const collection = getCollection(target.id);
        const entries = Object.entries(collection);
        if (entries.length === 0) {
          await interaction.reply(`${target.username} hasn't collected any historical events yet.`);
          return;
        }
        const grouped = {};
        for (const tier of RARITY_TIERS) grouped[tier.name] = [];
        for (const [eventId, entry] of entries) {
          const event = findEventById(eventId);
          if (!event) continue;
          grouped[event.rarity].push(`${event.name} — Lv.${entry.level} (Power ${entry.power})${entry.count > 1 ? ` x${entry.count}` : ''}`);
        }
        const embed = new EmbedBuilder()
          .setTitle(`📚 ${target.username}'s Collection`)
          .setColor(0x5865f2)
          .setFooter({ text: `${entries.length}/${HISTORICAL_EVENTS.length} unique events collected` });
        for (const tier of [...RARITY_TIERS].reverse()) {
          if (grouped[tier.name].length > 0) {
            embed.addFields({ name: `${tier.frame} ${tier.name}`, value: grouped[tier.name].join('\n') });
          }
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'view': {
        const eventName = interaction.options.getString('event');
        const event = findEventByName(eventName);
        if (!event) {
          await interaction.reply({ content: 'No event found with that name.', ephemeral: true });
          return;
        }
        const collection = getCollection(interaction.user.id);
        const entry = collection[event.id];
        const rarity = getRarity(event.rarity);
        const embed = new EmbedBuilder()
          .setTitle(`${rarity.frame} ${event.name}`)
          .setDescription(`# ${event.flags}\n\n**Era:** ${event.era}\n**Rarity:** ${rarity.name}`)
          .setColor(rarity.color);
        if (entry) {
          embed.addFields(
            { name: 'Owned', value: `x${entry.count}`, inline: true },
            { name: 'Level', value: `${entry.level}`, inline: true },
            { name: 'Power', value: `${entry.power}`, inline: true },
          );
        } else {
          embed.addFields({ name: 'Status', value: "You haven't collected this one yet." });
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'upgrade': {
        const eventName = interaction.options.getString('event');
        const event = findEventByName(eventName);
        if (!event) {
          await interaction.reply({ content: 'No event found with that name.', ephemeral: true });
          return;
        }
        const collection = getCollection(interaction.user.id);
        const entry = collection[event.id];
        if (!entry) {
          await interaction.reply({ content: "You don't own this event yet.", ephemeral: true });
          return;
        }
        const cost = entry.level * 10;
        const points = getUpgradePoints(interaction.user.id);
        if (points < cost) {
          await interaction.reply({ content: `You need ${cost} upgrade points (you have ${points}). Duplicate catches earn points automatically.`, ephemeral: true });
          return;
        }
        const rarity = getRarity(event.rarity);
        data.upgradePoints[interaction.user.id] = points - cost;
        entry.level += 1;
        entry.power += Math.round(rarity.multiplier * 5);
        saveData(data);
        await interaction.reply(
          `⬆️ **${event.name}** upgraded to **Level ${entry.level}**! New power: **${entry.power}**. Remaining points: ${data.upgradePoints[interaction.user.id]}.`
        );
        return;
      }

      case 'battle': {
        const yourEventName = interaction.options.getString('your_event');
        const opponent = interaction.options.getUser('opponent');
        const opponentEventName = interaction.options.getString('opponent_event');

        if (opponent.id === interaction.user.id) {
          await interaction.reply({ content: "You can't battle yourself.", ephemeral: true });
          return;
        }
        const yourEvent = findEventByName(yourEventName);
        const oppEvent = findEventByName(opponentEventName);
        if (!yourEvent || !oppEvent) {
          await interaction.reply({ content: 'One of those event names wasn\'t recognized.', ephemeral: true });
          return;
        }
        const yourEntry = getCollection(interaction.user.id)[yourEvent.id];
        const oppEntry = getCollection(opponent.id)[oppEvent.id];
        if (!yourEntry) {
          await interaction.reply({ content: "You don't own that event.", ephemeral: true });
          return;
        }
        if (!oppEntry) {
          await interaction.reply({ content: `${opponent.username} doesn't own that event.`, ephemeral: true });
          return;
        }

        // Weighted random outcome — higher power = better odds, but not guaranteed
        const total = yourEntry.power + oppEntry.power;
        const roll = Math.random() * total;
        const youWin = roll < yourEntry.power;

        const winnerId = youWin ? interaction.user.id : opponent.id;
        const loserId = youWin ? opponent.id : interaction.user.id;
        getBattleStats(winnerId).wins += 1;
        getBattleStats(loserId).losses += 1;
        addUpgradePoints(winnerId, 10);
        saveData(data);

        const embed = new EmbedBuilder()
          .setTitle('⚔️ Battle Result')
          .setDescription(
            `**${yourEvent.name}** (Power ${yourEntry.power}) vs **${oppEvent.name}** (Power ${oppEntry.power})\n\n` +
            `🏆 **${youWin ? interaction.user.username : opponent.username}** wins with **${youWin ? yourEvent.name : oppEvent.name}**!\n\n` +
            `+10 upgrade points awarded.`
          )
          .setColor(youWin ? 0x2ecc71 : 0xe74c3c);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'dex': {
        const collection = getCollection(interaction.user.id);
        const grouped = {};
        for (const tier of RARITY_TIERS) grouped[tier.name] = [];
        for (const event of HISTORICAL_EVENTS) {
          const owned = !!collection[event.id];
          const rarity = getRarity(event.rarity);
          grouped[event.rarity].push(owned ? `${rarity.frame} ${event.name}` : `❔ ???`);
        }
        const embed = new EmbedBuilder()
          .setTitle('📖 Historicaldex')
          .setColor(0x5865f2)
          .setFooter({ text: `${Object.keys(collection).length}/${HISTORICAL_EVENTS.length} discovered` });
        for (const tier of [...RARITY_TIERS].reverse()) {
          if (grouped[tier.name].length > 0) {
            embed.addFields({ name: `${tier.frame} ${tier.name}`, value: grouped[tier.name].join('\n') });
          }
        }
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'progress': {
        const target = interaction.options.getUser('user') || interaction.user;
        const collection = getCollection(target.id);
        const owned = Object.keys(collection).length;
        const total = HISTORICAL_EVENTS.length;
        const pct = Math.round((owned / total) * 100);

        const perTier = RARITY_TIERS.map((tier) => {
          const totalOfTier = HISTORICAL_EVENTS.filter((e) => e.rarity === tier.name).length;
          const ownedOfTier = Object.keys(collection).filter((id) => findEventById(id)?.rarity === tier.name).length;
          return `${tier.frame} ${tier.name}: ${ownedOfTier}/${totalOfTier}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${target.username}'s Progress`)
          .setDescription(`**Overall: ${owned}/${total} (${pct}%)**\n\n${perTier}`)
          .setColor(0x9b59b6);
        await interaction.reply({ embeds: [embed] });
        return;
      }

      case 'leaderboard': {
        const totals = Object.entries(data.collections).map(([userId, collection]) => {
          const totalPower = Object.values(collection).reduce((sum, e) => sum + e.power, 0);
          return { userId, totalPower, unique: Object.keys(collection).length };
        }).sort((a, b) => b.totalPower - a.totalPower).slice(0, 10);

        if (totals.length === 0) {
          await interaction.reply('No one has collected anything yet.');
          return;
        }
        const lines = await Promise.all(totals.map(async (t, i) => {
          const user = await client.users.fetch(t.userId).catch(() => null);
          return `**${i + 1}.** ${user ? user.username : 'Unknown'} — ${t.totalPower} power (${t.unique} unique)`;
        }));
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Leaderboard').setDescription(lines.join('\n')).setColor(0xf1c40f)] });
        return;
      }

      default:
        await interaction.reply({ content: 'Unrecognized command.', ephemeral: true });
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.BOT_TOKEN);
