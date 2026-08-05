require('dotenv').config();
const {
  Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, SlashCommandBuilder, REST, Routes,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
} = require('discord.js');
const fs = require('fs');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ============================================================
// GOAL / SAVE GIFS — shown on the commentary embed for that event
// ============================================================
const GOAL_GIFS = [
  'https://media.giphy.com/media/lD76yTC5zxZPG/giphy.gif',
  'https://media.giphy.com/media/xUPGcyjuFraskbBUQ8/giphy.gif',
  'https://media.giphy.com/media/3o7TKUM3IgJBX2as9O/giphy.gif',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
];
const SAVE_GIFS = [
  'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif',
  'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
  'https://media.giphy.com/media/l0MYGB1LuZ3n7dRnO/giphy.gif',
];
function randomGif(list) { return list[Math.floor(Math.random() * list.length)]; }

// ============================================================
// DERBIES — special rivalry names shown instead of "Friendly Match"
// when these two country codes face off
// ============================================================
const DERBIES = {
  'es|mx': 'Battle of the Latins 🇪🇸🇲🇽',
  'fr|de': 'France vs Germany — European Rivalry 🇫🇷🇩🇪',
  'ar|br': 'Superclásico de las Américas 🇦🇷🇧🇷',
  'gb-eng|fr': 'Cross-Channel Clash 🏴󠁧󠁢󠁥󠁮󠁧󠁿🇫🇷',
  'de|nl': 'Der Klassiker 🇩🇪🇳🇱',
  'pt|es': 'Iberian Derby 🇵🇹🇪🇸',
};
function getDerbyName(codeA, codeB) {
  return DERBIES[`${codeA}|${codeB}`] || DERBIES[`${codeB}|${codeA}`] || null;
}

// Per-channel cooldown so people can't chain matches back to back
const matchCooldowns = new Map(); // channelId -> timestamp match ended
const MATCH_COOLDOWN_MS = 30 * 1000;

function recordGoal(playerName) {
  data.playerGoals[playerName] = (data.playerGoals[playerName] || 0) + 1;
}

const GUILD_ID = '1324059331406069872';
const DATA_FILE = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? `${process.env.RAILWAY_VOLUME_MOUNT_PATH}/data.json`
  : './data.json';

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    return { teams: {}, cityTeams: {}, coins: {}, lastDaily: {}, boosts: {}, players: {}, tournaments: {}, tournamentsCompleted: {} };
  }
  const p = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  p.teams ??= {}; p.coins ??= {}; p.lastDaily ??= {}; p.boosts ??= {}; p.players ??= {};
  p.tournaments ??= {};
  p.tournamentsCompleted ??= {};
  p.cityTeams ??= {};
  p.playerGoals ??= {};
  p.starPlayersSeeded ??= false;
  return p;
}
function saveData(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
let data = loadData();

function cdnFlag(code) { return `https://flagcdn.com/w320/${code}.png`; }
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ============================================================
// COUNTRIES (every UN member + Vatican + Palestine + home nations)
// ============================================================
const COUNTRIES = [
  { name: 'Algeria', code: 'dz' }, { name: 'Angola', code: 'ao' }, { name: 'Benin', code: 'bj' },
  { name: 'Botswana', code: 'bw' }, { name: 'Burkina Faso', code: 'bf' }, { name: 'Burundi', code: 'bi' },
  { name: 'Cabo Verde', code: 'cv' }, { name: 'Cameroon', code: 'cm' }, { name: 'Central African Republic', code: 'cf' },
  { name: 'Chad', code: 'td' }, { name: 'Comoros', code: 'km' }, { name: 'Congo', code: 'cg' },
  { name: 'DR Congo', code: 'cd' }, { name: 'Djibouti', code: 'dj' }, { name: 'Egypt', code: 'eg' },
  { name: 'Equatorial Guinea', code: 'gq' }, { name: 'Eritrea', code: 'er' }, { name: 'Eswatini', code: 'sz' },
  { name: 'Ethiopia', code: 'et' }, { name: 'Gabon', code: 'ga' }, { name: 'Gambia', code: 'gm' },
  { name: 'Ghana', code: 'gh' }, { name: 'Guinea', code: 'gn' }, { name: 'Guinea-Bissau', code: 'gw' },
  { name: 'Ivory Coast', code: 'ci' }, { name: 'Kenya', code: 'ke' }, { name: 'Lesotho', code: 'ls' },
  { name: 'Liberia', code: 'lr' }, { name: 'Libya', code: 'ly' }, { name: 'Madagascar', code: 'mg' },
  { name: 'Malawi', code: 'mw' }, { name: 'Mali', code: 'ml' }, { name: 'Mauritania', code: 'mr' },
  { name: 'Mauritius', code: 'mu' }, { name: 'Morocco', code: 'ma' }, { name: 'Mozambique', code: 'mz' },
  { name: 'Namibia', code: 'na' }, { name: 'Niger', code: 'ne' }, { name: 'Nigeria', code: 'ng' },
  { name: 'Rwanda', code: 'rw' }, { name: 'Sao Tome and Principe', code: 'st' }, { name: 'Senegal', code: 'sn' },
  { name: 'Seychelles', code: 'sc' }, { name: 'Sierra Leone', code: 'sl' }, { name: 'Somalia', code: 'so' },
  { name: 'South Africa', code: 'za' }, { name: 'South Sudan', code: 'ss' }, { name: 'Sudan', code: 'sd' },
  { name: 'Tanzania', code: 'tz' }, { name: 'Togo', code: 'tg' }, { name: 'Tunisia', code: 'tn' },
  { name: 'Uganda', code: 'ug' }, { name: 'Zambia', code: 'zm' }, { name: 'Zimbabwe', code: 'zw' },
  { name: 'Antigua and Barbuda', code: 'ag' }, { name: 'Argentina', code: 'ar' }, { name: 'Bahamas', code: 'bs' },
  { name: 'Barbados', code: 'bb' }, { name: 'Belize', code: 'bz' }, { name: 'Bolivia', code: 'bo' },
  { name: 'Brazil', code: 'br' }, { name: 'Canada', code: 'ca' }, { name: 'Chile', code: 'cl' },
  { name: 'Colombia', code: 'co' }, { name: 'Costa Rica', code: 'cr' }, { name: 'Cuba', code: 'cu' },
  { name: 'Dominica', code: 'dm' }, { name: 'Dominican Republic', code: 'do' }, { name: 'Ecuador', code: 'ec' },
  { name: 'El Salvador', code: 'sv' }, { name: 'Grenada', code: 'gd' }, { name: 'Guatemala', code: 'gt' },
  { name: 'Guyana', code: 'gy' }, { name: 'Haiti', code: 'ht' }, { name: 'Honduras', code: 'hn' },
  { name: 'Jamaica', code: 'jm' }, { name: 'Mexico', code: 'mx' }, { name: 'Nicaragua', code: 'ni' },
  { name: 'Panama', code: 'pa' }, { name: 'Paraguay', code: 'py' }, { name: 'Peru', code: 'pe' },
  { name: 'Saint Kitts and Nevis', code: 'kn' }, { name: 'Saint Lucia', code: 'lc' },
  { name: 'Saint Vincent and the Grenadines', code: 'vc' }, { name: 'Suriname', code: 'sr' },
  { name: 'Trinidad and Tobago', code: 'tt' }, { name: 'USA', code: 'us' }, { name: 'Uruguay', code: 'uy' },
  { name: 'Venezuela', code: 've' },
  { name: 'Afghanistan', code: 'af' }, { name: 'Bahrain', code: 'bh' }, { name: 'Bangladesh', code: 'bd' },
  { name: 'Bhutan', code: 'bt' }, { name: 'Brunei', code: 'bn' }, { name: 'Cambodia', code: 'kh' },
  { name: 'China', code: 'cn' }, { name: 'Georgia', code: 'ge' }, { name: 'India', code: 'in' },
  { name: 'Indonesia', code: 'id' }, { name: 'Iran', code: 'ir' }, { name: 'Iraq', code: 'iq' },
  { name: 'Israel', code: 'il' }, { name: 'Japan', code: 'jp' }, { name: 'Jordan', code: 'jo' },
  { name: 'Kazakhstan', code: 'kz' }, { name: 'Kuwait', code: 'kw' }, { name: 'Kyrgyzstan', code: 'kg' },
  { name: 'Laos', code: 'la' }, { name: 'Lebanon', code: 'lb' }, { name: 'Malaysia', code: 'my' },
  { name: 'Maldives', code: 'mv' }, { name: 'Mongolia', code: 'mn' }, { name: 'Myanmar', code: 'mm' },
  { name: 'Nepal', code: 'np' }, { name: 'North Korea', code: 'kp' }, { name: 'Oman', code: 'om' },
  { name: 'Pakistan', code: 'pk' }, { name: 'Philippines', code: 'ph' }, { name: 'Qatar', code: 'qa' },
  { name: 'Saudi Arabia', code: 'sa' }, { name: 'Singapore', code: 'sg' }, { name: 'South Korea', code: 'kr' },
  { name: 'Sri Lanka', code: 'lk' }, { name: 'Syria', code: 'sy' }, { name: 'Tajikistan', code: 'tj' },
  { name: 'Thailand', code: 'th' }, { name: 'Timor-Leste', code: 'tl' }, { name: 'Turkey', code: 'tr' },
  { name: 'Turkmenistan', code: 'tm' }, { name: 'United Arab Emirates', code: 'ae' }, { name: 'Uzbekistan', code: 'uz' },
  { name: 'Vietnam', code: 'vn' }, { name: 'Yemen', code: 'ye' }, { name: 'Palestine', code: 'ps' },
  { name: 'Albania', code: 'al' }, { name: 'Andorra', code: 'ad' }, { name: 'Austria', code: 'at' },
  { name: 'Belarus', code: 'by' }, { name: 'Belgium', code: 'be' }, { name: 'Bosnia and Herzegovina', code: 'ba' },
  { name: 'Bulgaria', code: 'bg' }, { name: 'Croatia', code: 'hr' }, { name: 'Cyprus', code: 'cy' },
  { name: 'Czechia', code: 'cz' }, { name: 'Denmark', code: 'dk' }, { name: 'Estonia', code: 'ee' },
  { name: 'Finland', code: 'fi' }, { name: 'France', code: 'fr' }, { name: 'Germany', code: 'de' },
  { name: 'Greece', code: 'gr' }, { name: 'Hungary', code: 'hu' }, { name: 'Iceland', code: 'is' },
  { name: 'Ireland', code: 'ie' }, { name: 'Italy', code: 'it' }, { name: 'Latvia', code: 'lv' },
  { name: 'Liechtenstein', code: 'li' }, { name: 'Lithuania', code: 'lt' }, { name: 'Luxembourg', code: 'lu' },
  { name: 'Malta', code: 'mt' }, { name: 'Moldova', code: 'md' }, { name: 'Monaco', code: 'mc' },
  { name: 'Montenegro', code: 'me' }, { name: 'Netherlands', code: 'nl' }, { name: 'North Macedonia', code: 'mk' },
  { name: 'Norway', code: 'no' }, { name: 'Poland', code: 'pl' }, { name: 'Portugal', code: 'pt' },
  { name: 'Romania', code: 'ro' }, { name: 'Russia', code: 'ru' }, { name: 'San Marino', code: 'sm' },
  { name: 'Serbia', code: 'rs' }, { name: 'Slovakia', code: 'sk' }, { name: 'Slovenia', code: 'si' },
  { name: 'Spain', code: 'es' }, { name: 'Sweden', code: 'se' }, { name: 'Switzerland', code: 'ch' },
  { name: 'Ukraine', code: 'ua' }, { name: 'United Kingdom', code: 'gb' }, { name: 'Vatican City', code: 'va' },
  { name: 'England', code: 'gb-eng' }, { name: 'Scotland', code: 'gb-sct' }, { name: 'Wales', code: 'gb-wls' },
  { name: 'Australia', code: 'au' }, { name: 'Fiji', code: 'fj' }, { name: 'Kiribati', code: 'ki' },
  { name: 'Marshall Islands', code: 'mh' }, { name: 'Micronesia', code: 'fm' }, { name: 'Nauru', code: 'nr' },
  { name: 'New Zealand', code: 'nz' }, { name: 'Palau', code: 'pw' }, { name: 'Papua New Guinea', code: 'pg' },
  { name: 'Samoa', code: 'ws' }, { name: 'Solomon Islands', code: 'sb' }, { name: 'Tonga', code: 'to' },
  { name: 'Tuvalu', code: 'tv' }, { name: 'Vanuatu', code: 'vu' },
];

// ---------- Team / player helpers ----------
// National teams are scoped per Discord server: data.teams[guildId][userId]
function getGuildTeams(guildId) { data.teams[guildId] = data.teams[guildId] || {}; return data.teams[guildId]; }
function getTeam(guildId, userId) { return getGuildTeams(guildId)[userId] || null; }
function getCityTeam(userId) { return data.cityTeams[userId] || null; }
function isCountryTaken(guildId, code, excludeUserId) {
  return Object.entries(getGuildTeams(guildId)).some(([uid, t]) => t.code === code && uid !== excludeUserId);
}
function getCoins(userId) { return data.coins[userId] || 0; }
function addCoins(userId, amount) { data.coins[userId] = Math.max(0, (data.coins[userId] || 0) + amount); }
function getBoosts(userId) { data.boosts[userId] = data.boosts[userId] || {}; return data.boosts[userId]; }
function getSquadPlayers(guildId, userId) {
  const team = getTeam(guildId, userId);
  if (!team?.squad) return [];
  return team.squad.map((id) => data.players[id]).filter(Boolean);
}
function makePlayerId(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Math.floor(Math.random() * 10000)}`;
}

// ============================================================
// DEFAULT SQUADS — real rosters seeded automatically so picking that
// country doesn't leave you with an empty squad. Reflects each nation's
// core 2026 FIFA World Cup starting XI (or best-known regular lineup).
// ============================================================
const DEFAULT_SQUADS = {
  br: [
    { name: 'Alisson', position: 'GK', rating: 89 },
    { name: 'Danilo', position: 'DEF', rating: 82 },
    { name: 'Marquinhos', position: 'DEF', rating: 87 },
    { name: 'Gabriel Magalhães', position: 'DEF', rating: 85 },
    { name: 'Douglas Santos', position: 'DEF', rating: 80 },
    { name: 'Bruno Guimarães', position: 'MID', rating: 87 },
    { name: 'Casemiro', position: 'MID', rating: 85 },
    { name: 'Raphinha', position: 'MID', rating: 88 },
    { name: 'Neymar Jr', position: 'FWD', rating: 88 },
    { name: 'Vinícius Júnior', position: 'FWD', rating: 91 },
    { name: 'Gabriel Martinelli', position: 'FWD', rating: 85 },
  ],
  'gb-eng': [
    { name: 'Jordan Pickford', position: 'GK', rating: 84 },
    { name: 'Reece James', position: 'DEF', rating: 84 },
    { name: 'John Stones', position: 'DEF', rating: 84 },
    { name: 'Marc Guehi', position: 'DEF', rating: 83 },
    { name: 'Nico O\'Reilly', position: 'DEF', rating: 78 },
    { name: 'Declan Rice', position: 'MID', rating: 88 },
    { name: 'Jude Bellingham', position: 'MID', rating: 90 },
    { name: 'Elliot Anderson', position: 'MID', rating: 79 },
    { name: 'Bukayo Saka', position: 'FWD', rating: 88 },
    { name: 'Harry Kane', position: 'FWD', rating: 89 },
    { name: 'Marcus Rashford', position: 'FWD', rating: 84 },
  ],
  ma: [
    { name: 'Yassine Bounou', position: 'GK', rating: 85 },
    { name: 'Achraf Hakimi', position: 'DEF', rating: 88 },
    { name: 'Issa Diop', position: 'DEF', rating: 80 },
    { name: 'Chadi Riad', position: 'DEF', rating: 79 },
    { name: 'Noussair Mazraoui', position: 'DEF', rating: 82 },
    { name: 'Ayyoub Bouaddi', position: 'MID', rating: 78 },
    { name: 'Neil El Aynaoui', position: 'MID', rating: 79 },
    { name: 'Azzedine Ounahi', position: 'MID', rating: 81 },
    { name: 'Brahim Díaz', position: 'FWD', rating: 84 },
    { name: 'Bilal El Khannouss', position: 'FWD', rating: 81 },
    { name: 'Soufiane Rahimi', position: 'FWD', rating: 80 },
  ],
  no: [
    { name: 'Ørjan Nyland', position: 'GK', rating: 78 },
    { name: 'Julian Ryerson', position: 'DEF', rating: 82 },
    { name: 'Kristoffer Ajer', position: 'DEF', rating: 80 },
    { name: 'Leo Østigård', position: 'DEF', rating: 79 },
    { name: 'Fredrik Bjørkan', position: 'DEF', rating: 77 },
    { name: 'Martin Ødegaard', position: 'MID', rating: 88 },
    { name: 'Sander Berge', position: 'MID', rating: 80 },
    { name: 'Kristian Thorstvedt', position: 'MID', rating: 78 },
    { name: 'Antonio Nusa', position: 'FWD', rating: 83 },
    { name: 'Erling Haaland', position: 'FWD', rating: 94 },
    { name: 'Alexander Sørloth', position: 'FWD', rating: 84 },
  ],
  fr: [
    { name: 'Mike Maignan', position: 'GK', rating: 87 },
    { name: 'Jules Koundé', position: 'DEF', rating: 85 },
    { name: 'William Saliba', position: 'DEF', rating: 87 },
    { name: 'Dayot Upamecano', position: 'DEF', rating: 85 },
    { name: 'Théo Hernández', position: 'DEF', rating: 84 },
    { name: 'Adrien Rabiot', position: 'MID', rating: 82 },
    { name: 'Aurélien Tchouaméni', position: 'MID', rating: 85 },
    { name: 'Michael Olise', position: 'FWD', rating: 85 },
    { name: 'Désiré Doué', position: 'FWD', rating: 84 },
    { name: 'Kylian Mbappé', position: 'FWD', rating: 93 },
    { name: 'Ousmane Dembélé', position: 'FWD', rating: 89 },
  ],
  ar: [
    { name: 'Emiliano Martínez', position: 'GK', rating: 88 },
    { name: 'Nahuel Molina', position: 'DEF', rating: 82 },
    { name: 'Cristian Romero', position: 'DEF', rating: 86 },
    { name: 'Nicolás Otamendi', position: 'DEF', rating: 83 },
    { name: 'Facundo Medina', position: 'DEF', rating: 81 },
    { name: 'Rodrigo De Paul', position: 'MID', rating: 85 },
    { name: 'Enzo Fernández', position: 'MID', rating: 86 },
    { name: 'Alexis Mac Allister', position: 'MID', rating: 86 },
    { name: 'Lionel Messi', position: 'FWD', rating: 90 },
    { name: 'Julián Álvarez', position: 'FWD', rating: 87 },
    { name: 'Lautaro Martínez', position: 'FWD', rating: 87 },
  ],
  es: [
    { name: 'Unai Simón', position: 'GK', rating: 84 },
    { name: 'Dani Carvajal', position: 'DEF', rating: 84 },
    { name: 'Robin Le Normand', position: 'DEF', rating: 83 },
    { name: 'Aymeric Laporte', position: 'DEF', rating: 83 },
    { name: 'Marc Cucurella', position: 'DEF', rating: 82 },
    { name: 'Rodri', position: 'MID', rating: 90 },
    { name: 'Pedri', position: 'MID', rating: 88 },
    { name: 'Fabián Ruiz', position: 'MID', rating: 84 },
    { name: 'Lamine Yamal', position: 'FWD', rating: 89 },
    { name: 'Ferran Torres', position: 'FWD', rating: 82 },
    { name: 'Nico Williams', position: 'FWD', rating: 85 },
  ],
  pt: [
    { name: 'Diogo Costa', position: 'GK', rating: 85 },
    { name: 'João Cancelo', position: 'DEF', rating: 84 },
    { name: 'Rúben Dias', position: 'DEF', rating: 88 },
    { name: 'Gonçalo Inácio', position: 'DEF', rating: 81 },
    { name: 'Nuno Mendes', position: 'DEF', rating: 84 },
    { name: 'Vitinha', position: 'MID', rating: 86 },
    { name: 'Bruno Fernandes', position: 'MID', rating: 87 },
    { name: 'Bernardo Silva', position: 'MID', rating: 87 },
    { name: 'Cristiano Ronaldo', position: 'FWD', rating: 85 },
    { name: 'Rafael Leão', position: 'FWD', rating: 85 },
    { name: 'Gonçalo Ramos', position: 'FWD', rating: 82 },
  ],
  de: [
    { name: 'Marc-André ter Stegen', position: 'GK', rating: 87 },
    { name: 'Joshua Kimmich', position: 'DEF', rating: 87 },
    { name: 'Antonio Rüdiger', position: 'DEF', rating: 85 },
    { name: 'Jonathan Tah', position: 'DEF', rating: 82 },
    { name: 'David Raum', position: 'DEF', rating: 80 },
    { name: 'Robert Andrich', position: 'MID', rating: 79 },
    { name: 'Florian Wirtz', position: 'MID', rating: 88 },
    { name: 'Jamal Musiala', position: 'MID', rating: 89 },
    { name: 'Serge Gnabry', position: 'FWD', rating: 82 },
    { name: 'Kai Havertz', position: 'FWD', rating: 84 },
    { name: 'Leroy Sané', position: 'FWD', rating: 83 },
  ],
  nl: [
    { name: 'Bart Verbruggen', position: 'GK', rating: 81 },
    { name: 'Denzel Dumfries', position: 'DEF', rating: 83 },
    { name: 'Virgil van Dijk', position: 'DEF', rating: 87 },
    { name: 'Stefan de Vrij', position: 'DEF', rating: 80 },
    { name: 'Nathan Aké', position: 'DEF', rating: 81 },
    { name: 'Tijjani Reijnders', position: 'MID', rating: 84 },
    { name: 'Frenkie de Jong', position: 'MID', rating: 86 },
    { name: 'Xavi Simons', position: 'MID', rating: 85 },
    { name: 'Cody Gakpo', position: 'FWD', rating: 84 },
    { name: 'Memphis Depay', position: 'FWD', rating: 82 },
    { name: 'Donyell Malen', position: 'FWD', rating: 80 },
  ],
  us: [
    { name: 'Matt Turner', position: 'GK', rating: 78 },
    { name: 'Sergiño Dest', position: 'DEF', rating: 81 },
    { name: 'Tim Ream', position: 'DEF', rating: 76 },
    { name: 'Chris Richards', position: 'DEF', rating: 78 },
    { name: 'Antonee Robinson', position: 'DEF', rating: 80 },
    { name: 'Tyler Adams', position: 'MID', rating: 81 },
    { name: 'Weston McKennie', position: 'MID', rating: 82 },
    { name: 'Yunus Musah', position: 'MID', rating: 80 },
    { name: 'Christian Pulisic', position: 'FWD', rating: 85 },
    { name: 'Folarin Balogun', position: 'FWD', rating: 79 },
    { name: 'Timothy Weah', position: 'FWD', rating: 78 },
  ],
  be: [
    { name: 'Koen Casteels', position: 'GK', rating: 80 },
    { name: 'Jan Vertonghen', position: 'DEF', rating: 78 },
    { name: 'Wout Faes', position: 'DEF', rating: 79 },
    { name: 'Zeno Debast', position: 'DEF', rating: 79 },
    { name: 'Arthur Theate', position: 'DEF', rating: 78 },
    { name: 'Amadou Onana', position: 'MID', rating: 82 },
    { name: 'Youri Tielemans', position: 'MID', rating: 81 },
    { name: 'Kevin De Bruyne', position: 'MID', rating: 88 },
    { name: 'Jérémy Doku', position: 'FWD', rating: 84 },
    { name: 'Romelu Lukaku', position: 'FWD', rating: 83 },
    { name: 'Loïs Openda', position: 'FWD', rating: 83 },
  ],
  uy: [
    { name: 'Sergio Rochet', position: 'GK', rating: 81 },
    { name: 'Ronald Araújo', position: 'DEF', rating: 85 },
    { name: 'José María Giménez', position: 'DEF', rating: 83 },
    { name: 'Sebastián Cáceres', position: 'DEF', rating: 78 },
    { name: 'Guillermo Varela', position: 'DEF', rating: 76 },
    { name: 'Manuel Ugarte', position: 'MID', rating: 82 },
    { name: 'Federico Valverde', position: 'MID', rating: 88 },
    { name: 'Rodrigo Bentancur', position: 'MID', rating: 82 },
    { name: 'Facundo Pellistri', position: 'FWD', rating: 79 },
    { name: 'Darwin Núñez', position: 'FWD', rating: 84 },
    { name: 'Cristhian Olivera', position: 'FWD', rating: 76 },
  ],
  hr: [
    { name: 'Dominik Livaković', position: 'GK', rating: 83 },
    { name: 'Josip Stanišić', position: 'DEF', rating: 79 },
    { name: 'Joško Gvardiol', position: 'DEF', rating: 86 },
    { name: 'Josip Šutalo', position: 'DEF', rating: 79 },
    { name: 'Borna Sosa', position: 'DEF', rating: 77 },
    { name: 'Luka Modrić', position: 'MID', rating: 86 },
    { name: 'Martin Baturina', position: 'MID', rating: 80 },
    { name: 'Mateo Kovačić', position: 'MID', rating: 83 },
    { name: 'Ante Budimir', position: 'FWD', rating: 78 },
    { name: 'Andrej Kramarić', position: 'FWD', rating: 80 },
    { name: 'Marko Pjaca', position: 'FWD', rating: 75 },
  ],
  mx: [
    { name: 'Luis Malagón', position: 'GK', rating: 78 },
    { name: 'Jorge Sánchez', position: 'DEF', rating: 77 },
    { name: 'Johan Vásquez', position: 'DEF', rating: 78 },
    { name: 'César Montes', position: 'DEF', rating: 77 },
    { name: 'Gerardo Arteaga', position: 'DEF', rating: 78 },
    { name: 'Edson Álvarez', position: 'MID', rating: 82 },
    { name: 'Orbelín Pineda', position: 'MID', rating: 77 },
    { name: 'Luis Chávez', position: 'MID', rating: 79 },
    { name: 'Santiago Giménez', position: 'FWD', rating: 82 },
    { name: 'Hirving Lozano', position: 'FWD', rating: 80 },
    { name: 'Gilberto Mora', position: 'FWD', rating: 78 },
  ],
  kr: [
    { name: 'Jo Hyeon-woo', position: 'GK', rating: 78 },
    { name: 'Kim Min-jae', position: 'DEF', rating: 85 },
    { name: 'Kim Young-gwon', position: 'DEF', rating: 78 },
    { name: 'Kim Jin-su', position: 'DEF', rating: 77 },
    { name: 'Park Yong-woo', position: 'MID', rating: 79 },
    { name: 'Hong Hyun-seok', position: 'MID', rating: 78 },
    { name: 'Lee Kang-in', position: 'MID', rating: 84 },
    { name: 'Son Heung-min', position: 'FWD', rating: 87 },
    { name: 'Hwang Hee-chan', position: 'FWD', rating: 82 },
    { name: 'Cho Gue-sung', position: 'FWD', rating: 78 },
  ],
  cz: [
    { name: 'Jindřich Staněk', position: 'GK', rating: 77 },
    { name: 'Vladimír Coufal', position: 'DEF', rating: 79 },
    { name: 'Ladislav Krejčí', position: 'DEF', rating: 78 },
    { name: 'Robin Hranáč', position: 'DEF', rating: 77 },
    { name: 'David Doudera', position: 'DEF', rating: 76 },
    { name: 'Tomáš Souček', position: 'MID', rating: 82 },
    { name: 'Antonín Barák', position: 'MID', rating: 78 },
    { name: 'Lukáš Provod', position: 'MID', rating: 77 },
    { name: 'Patrik Schick', position: 'FWD', rating: 84 },
    { name: 'Adam Hložek', position: 'FWD', rating: 79 },
    { name: 'Václav Černý', position: 'FWD', rating: 77 },
  ],
  ca: [
    { name: 'Milan Borjan', position: 'GK', rating: 78 },
    { name: 'Kamal Miller', position: 'DEF', rating: 78 },
    { name: 'Moise Bombito', position: 'DEF', rating: 78 },
    { name: 'Richie Laryea', position: 'DEF', rating: 78 },
    { name: 'Alphonso Davies', position: 'DEF', rating: 85 },
    { name: 'Stephen Eustáquio', position: 'MID', rating: 80 },
    { name: 'Ismaël Koné', position: 'MID', rating: 79 },
    { name: 'Tajon Buchanan', position: 'MID', rating: 80 },
    { name: 'Jonathan David', position: 'FWD', rating: 85 },
    { name: 'Cyle Larin', position: 'FWD', rating: 78 },
    { name: 'Jacob Shaffelburg', position: 'FWD', rating: 76 },
  ],
  ch: [
    { name: 'Gregor Kobel', position: 'GK', rating: 84 },
    { name: 'Manuel Akanji', position: 'DEF', rating: 84 },
    { name: 'Ricardo Rodríguez', position: 'DEF', rating: 77 },
    { name: 'Nico Elvedi', position: 'DEF', rating: 79 },
    { name: 'Eray Cömert', position: 'DEF', rating: 77 },
    { name: 'Granit Xhaka', position: 'MID', rating: 85 },
    { name: 'Remo Freuler', position: 'MID', rating: 80 },
    { name: 'Ardon Jashari', position: 'MID', rating: 79 },
    { name: 'Dan Ndoye', position: 'FWD', rating: 82 },
    { name: 'Breel Embolo', position: 'FWD', rating: 81 },
    { name: 'Zeki Amdouni', position: 'FWD', rating: 79 },
  ],
  'gb-sct': [
    { name: 'Craig Gordon', position: 'GK', rating: 76 },
    { name: 'Andy Robertson', position: 'DEF', rating: 82 },
    { name: 'Kieran Tierney', position: 'DEF', rating: 79 },
    { name: 'Grant Hanley', position: 'DEF', rating: 76 },
    { name: 'John Souttar', position: 'DEF', rating: 76 },
    { name: 'Scott McTominay', position: 'MID', rating: 84 },
    { name: 'John McGinn', position: 'MID', rating: 81 },
    { name: 'Ryan Christie', position: 'MID', rating: 78 },
    { name: 'Che Adams', position: 'FWD', rating: 78 },
    { name: 'Lyndon Dykes', position: 'FWD', rating: 76 },
    { name: 'Ben Doak', position: 'FWD', rating: 78 },
  ],
  py: [
    { name: 'Roberto Fernández', position: 'GK', rating: 78 },
    { name: 'Gustavo Gómez', position: 'DEF', rating: 82 },
    { name: 'Omar Alderete', position: 'DEF', rating: 80 },
    { name: 'Fabián Balbuena', position: 'DEF', rating: 78 },
    { name: 'Alberto Espínola', position: 'DEF', rating: 75 },
    { name: 'Mathías Villasanti', position: 'MID', rating: 78 },
    { name: 'Damián Bobadilla', position: 'MID', rating: 76 },
    { name: 'Miguel Almirón', position: 'MID', rating: 82 },
    { name: 'Julio Enciso', position: 'FWD', rating: 80 },
    { name: 'Antonio Sanabria', position: 'FWD', rating: 78 },
    { name: 'Ramón Sosa', position: 'FWD', rating: 77 },
  ],
  au: [
    { name: 'Joe Gauci', position: 'GK', rating: 77 },
    { name: 'Harry Souttar', position: 'DEF', rating: 79 },
    { name: 'Milos Degenek', position: 'DEF', rating: 77 },
    { name: 'Aziz Behich', position: 'DEF', rating: 76 },
    { name: 'Kai Trewin', position: 'DEF', rating: 74 },
    { name: 'Jackson Irvine', position: 'MID', rating: 79 },
    { name: 'Aiden O\'Neill', position: 'MID', rating: 76 },
    { name: 'Cameron Devlin', position: 'MID', rating: 75 },
    { name: 'Mathew Leckie', position: 'FWD', rating: 76 },
    { name: 'Awer Mabil', position: 'FWD', rating: 76 },
    { name: 'Nestory Irankunda', position: 'FWD', rating: 78 },
  ],
  tr: [
    { name: 'Uğurcan Çakır', position: 'GK', rating: 81 },
    { name: 'Zeki Çelik', position: 'DEF', rating: 79 },
    { name: 'Merih Demiral', position: 'DEF', rating: 82 },
    { name: 'Abdülkerim Bardakcı', position: 'DEF', rating: 77 },
    { name: 'Ferdi Kadıoğlu', position: 'DEF', rating: 80 },
    { name: 'Hakan Çalhanoğlu', position: 'MID', rating: 86 },
    { name: 'Orkun Kökçü', position: 'MID', rating: 81 },
    { name: 'İsmail Yüksek', position: 'MID', rating: 77 },
    { name: 'Arda Güler', position: 'FWD', rating: 85 },
    { name: 'Kenan Yıldız', position: 'FWD', rating: 84 },
    { name: 'Kerem Aktürkoğlu', position: 'FWD', rating: 79 },
  ],
  ec: [
    { name: 'Hernán Galíndez', position: 'GK', rating: 78 },
    { name: 'Piero Hincapié', position: 'DEF', rating: 83 },
    { name: 'Willian Pacho', position: 'DEF', rating: 82 },
    { name: 'Pervis Estupiñán', position: 'DEF', rating: 81 },
    { name: 'Ángelo Preciado', position: 'DEF', rating: 78 },
    { name: 'Moisés Caicedo', position: 'MID', rating: 87 },
    { name: 'José Cifuentes', position: 'MID', rating: 78 },
    { name: 'Kendry Páez', position: 'MID', rating: 80 },
    { name: 'Enner Valencia', position: 'FWD', rating: 79 },
    { name: 'Gonzalo Plata', position: 'FWD', rating: 78 },
    { name: 'Jeremy Sarmiento', position: 'FWD', rating: 77 },
  ],
  ci: [
    { name: 'Yahia Fofana', position: 'GK', rating: 78 },
    { name: 'Wilfried Singo', position: 'DEF', rating: 82 },
    { name: 'Evan Ndicka', position: 'DEF', rating: 82 },
    { name: 'Ousmane Diomande', position: 'DEF', rating: 81 },
    { name: 'Ghislain Konan', position: 'DEF', rating: 77 },
    { name: 'Franck Kessié', position: 'MID', rating: 83 },
    { name: 'Jean Séri', position: 'MID', rating: 79 },
    { name: 'Ibrahim Sangaré', position: 'MID', rating: 80 },
    { name: 'Simon Adingra', position: 'FWD', rating: 80 },
    { name: 'Yoan-Ange Bonny', position: 'FWD', rating: 77 },
    { name: 'Nicolas Pépé', position: 'FWD', rating: 78 },
  ],
  jp: [
    { name: 'Zion Suzuki', position: 'GK', rating: 79 },
    { name: 'Takehiro Tomiyasu', position: 'DEF', rating: 81 },
    { name: 'Ko Itakura', position: 'DEF', rating: 79 },
    { name: 'Hiroki Ito', position: 'DEF', rating: 78 },
    { name: 'Yukinari Sugawara', position: 'DEF', rating: 77 },
    { name: 'Hidemasa Morita', position: 'MID', rating: 80 },
    { name: 'Ao Tanaka', position: 'MID', rating: 79 },
    { name: 'Daichi Kamada', position: 'MID', rating: 80 },
    { name: 'Takefusa Kubo', position: 'FWD', rating: 85 },
    { name: 'Kaoru Mitoma', position: 'FWD', rating: 85 },
    { name: 'Ritsu Dōan', position: 'FWD', rating: 82 },
  ],
  se: [
    { name: 'Robin Olsen', position: 'GK', rating: 78 },
    { name: 'Pontus Jansson', position: 'DEF', rating: 78 },
    { name: 'Emil Krafth', position: 'DEF', rating: 76 },
    { name: 'Ludwig Augustinsson', position: 'DEF', rating: 76 },
    { name: 'Gustav Isaksson', position: 'DEF', rating: 74 },
    { name: 'Yasin Ayari', position: 'MID', rating: 79 },
    { name: 'Jesper Karlström', position: 'MID', rating: 75 },
    { name: 'Dejan Kulusevski', position: 'MID', rating: 85 },
    { name: 'Alexander Isak', position: 'FWD', rating: 88 },
    { name: 'Viktor Gyökeres', position: 'FWD', rating: 87 },
    { name: 'Anthony Elanga', position: 'FWD', rating: 81 },
  ],
  tn: [
    { name: 'Aymen Dahmen', position: 'GK', rating: 78 },
    { name: 'Mohamed Dräger', position: 'DEF', rating: 77 },
    { name: 'Yassine Meriah', position: 'DEF', rating: 76 },
    { name: 'Ali Abdi', position: 'DEF', rating: 76 },
    { name: 'Bilel Ifa', position: 'DEF', rating: 75 },
    { name: 'Ellyes Skhiri', position: 'MID', rating: 81 },
    { name: 'Aïssa Laïdouni', position: 'MID', rating: 79 },
    { name: 'Hannibal Mejbri', position: 'MID', rating: 80 },
    { name: 'Youssef Msakni', position: 'FWD', rating: 79 },
    { name: 'Seifeddine Jaziri', position: 'FWD', rating: 76 },
    { name: 'Elias Achouri', position: 'FWD', rating: 77 },
  ],
  eg: [
    { name: 'Mohamed El-Shenawy', position: 'GK', rating: 78 },
    { name: 'Ahmed Hegazi', position: 'DEF', rating: 77 },
    { name: 'Akram Tawfik', position: 'DEF', rating: 76 },
    { name: 'Ahmed Fatouh', position: 'DEF', rating: 76 },
    { name: 'Mohamed Abdelmonem', position: 'DEF', rating: 76 },
    { name: 'Mohamed Elneny', position: 'MID', rating: 79 },
    { name: 'Emam Ashour', position: 'MID', rating: 78 },
    { name: 'Mahmoud Trézéguet', position: 'MID', rating: 78 },
    { name: 'Mohamed Salah', position: 'FWD', rating: 89 },
    { name: 'Omar Marmoush', position: 'FWD', rating: 83 },
    { name: 'Mostafa Mohamed', position: 'FWD', rating: 78 },
  ],
  ir: [
    { name: 'Alireza Beiranvand', position: 'GK', rating: 79 },
    { name: 'Milad Mohammadi', position: 'DEF', rating: 77 },
    { name: 'Sadegh Moharrami', position: 'DEF', rating: 77 },
    { name: 'Shoja Khalilzadeh', position: 'DEF', rating: 75 },
    { name: 'Ali Gholizadeh', position: 'DEF', rating: 76 },
    { name: 'Ahmad Nourollahi', position: 'MID', rating: 78 },
    { name: 'Saman Ghoddos', position: 'MID', rating: 78 },
    { name: 'Alireza Jahanbakhsh', position: 'MID', rating: 78 },
    { name: 'Mehdi Taremi', position: 'FWD', rating: 83 },
    { name: 'Mehdi Ghayedi', position: 'FWD', rating: 76 },
    { name: 'Shahriar Moghanlou', position: 'FWD', rating: 74 },
  ],
  sn: [
    { name: 'Édouard Mendy', position: 'GK', rating: 82 },
    { name: 'Kalidou Koulibaly', position: 'DEF', rating: 85 },
    { name: 'Moussa Niakhaté', position: 'DEF', rating: 79 },
    { name: 'Krépin Diatta', position: 'DEF', rating: 79 },
    { name: 'El Hadji Malick Diouf', position: 'DEF', rating: 76 },
    { name: 'Idrissa Gana Gueye', position: 'MID', rating: 81 },
    { name: 'Pape Matar Sarr', position: 'MID', rating: 80 },
    { name: 'Habib Diarra', position: 'MID', rating: 79 },
    { name: 'Sadio Mané', position: 'FWD', rating: 85 },
    { name: 'Ismaïla Sarr', position: 'FWD', rating: 81 },
    { name: 'Nicolas Jackson', position: 'FWD', rating: 81 },
  ],
  dz: [
    { name: 'Alexandre Oukidja', position: 'GK', rating: 78 },
    { name: 'Ramy Bensebaini', position: 'DEF', rating: 82 },
    { name: 'Aïssa Mandi', position: 'DEF', rating: 78 },
    { name: 'Youcef Atal', position: 'DEF', rating: 79 },
    { name: 'Ahmed Touba', position: 'DEF', rating: 76 },
    { name: 'Ismaël Bennacer', position: 'MID', rating: 82 },
    { name: 'Houssem Aouar', position: 'MID', rating: 79 },
    { name: 'Nabil Bentaleb', position: 'MID', rating: 78 },
    { name: 'Riyad Mahrez', position: 'FWD', rating: 84 },
    { name: 'Amine Gouiri', position: 'FWD', rating: 80 },
    { name: 'Baghdad Bounedjah', position: 'FWD', rating: 76 },
  ],
  at: [
    { name: 'Patrick Pentz', position: 'GK', rating: 78 },
    { name: 'David Alaba', position: 'DEF', rating: 83 },
    { name: 'Kevin Danso', position: 'DEF', rating: 80 },
    { name: 'Philipp Lienhart', position: 'DEF', rating: 78 },
    { name: 'Alexander Prass', position: 'DEF', rating: 76 },
    { name: 'Marcel Sabitzer', position: 'MID', rating: 82 },
    { name: 'Konrad Laimer', position: 'MID', rating: 81 },
    { name: 'Nicolas Seiwald', position: 'MID', rating: 78 },
    { name: 'Michael Gregoritsch', position: 'FWD', rating: 78 },
    { name: 'Marko Arnautović', position: 'FWD', rating: 78 },
    { name: 'Patrick Wimmer', position: 'FWD', rating: 77 },
  ],
  co: [
    { name: 'Camilo Vargas', position: 'GK', rating: 79 },
    { name: 'Davinson Sánchez', position: 'DEF', rating: 79 },
    { name: 'Yerry Mina', position: 'DEF', rating: 78 },
    { name: 'Daniel Muñoz', position: 'DEF', rating: 80 },
    { name: 'Johan Mojica', position: 'DEF', rating: 77 },
    { name: 'Jefferson Lerma', position: 'MID', rating: 80 },
    { name: 'Richard Ríos', position: 'MID', rating: 81 },
    { name: 'James Rodríguez', position: 'MID', rating: 82 },
    { name: 'Luis Díaz', position: 'FWD', rating: 87 },
    { name: 'Jhon Durán', position: 'FWD', rating: 82 },
    { name: 'Jhon Arias', position: 'FWD', rating: 79 },
  ],
  gh: [
    { name: 'Lawrence Ati-Zigi', position: 'GK', rating: 78 },
    { name: 'Mohammed Salisu', position: 'DEF', rating: 80 },
    { name: 'Alidu Seidu', position: 'DEF', rating: 77 },
    { name: 'Denis Odoi', position: 'DEF', rating: 76 },
    { name: 'Gideon Mensah', position: 'DEF', rating: 76 },
    { name: 'Thomas Partey', position: 'MID', rating: 82 },
    { name: 'Iddrisu Baba', position: 'MID', rating: 77 },
    { name: 'Mohammed Kudus', position: 'MID', rating: 85 },
    { name: 'Jordan Ayew', position: 'FWD', rating: 78 },
    { name: 'Antoine Semenyo', position: 'FWD', rating: 80 },
    { name: 'Ernest Nuamah', position: 'FWD', rating: 79 },
  ],
  sa: [
    { name: 'Nawaf Al-Aqidi', position: 'GK', rating: 78 },
    { name: 'Ali Al-Bulaihi', position: 'DEF', rating: 76 },
    { name: 'Abdulelah Al-Amri', position: 'DEF', rating: 76 },
    { name: 'Saud Abdulhamid', position: 'DEF', rating: 77 },
    { name: 'Sultan Al-Ghannam', position: 'DEF', rating: 75 },
    { name: 'Mohammed Kanno', position: 'MID', rating: 78 },
    { name: 'Salman Al-Faraj', position: 'MID', rating: 76 },
    { name: 'Nasser Al-Dawsari', position: 'MID', rating: 76 },
    { name: 'Salem Al-Dawsari', position: 'FWD', rating: 81 },
    { name: 'Firas Al-Buraikan', position: 'FWD', rating: 77 },
    { name: 'Abdullah Al-Hamdan', position: 'FWD', rating: 75 },
  ],
  za: [
    { name: 'Ronwen Williams', position: 'GK', rating: 78 },
    { name: 'Mothobi Mvala', position: 'DEF', rating: 76 },
    { name: 'Siyabonga Ngezana', position: 'DEF', rating: 76 },
    { name: 'Aubrey Modiba', position: 'DEF', rating: 75 },
    { name: 'Thapelo Morena', position: 'DEF', rating: 75 },
    { name: 'Teboho Mokoena', position: 'MID', rating: 78 },
    { name: 'Themba Zwane', position: 'MID', rating: 79 },
    { name: 'Sphephelo Sithole', position: 'MID', rating: 75 },
    { name: 'Percy Tau', position: 'FWD', rating: 79 },
    { name: 'Lyle Foster', position: 'FWD', rating: 78 },
    { name: 'Evidence Makgopa', position: 'FWD', rating: 75 },
  ],
  pl: [
    { name: 'Wojciech Szczęsny', position: 'GK', rating: 82 },
    { name: 'Kamil Glik', position: 'DEF', rating: 76 },
    { name: 'Jakub Kiwior', position: 'DEF', rating: 80 },
    { name: 'Jan Bednarek', position: 'DEF', rating: 78 },
    { name: 'Przemysław Frankowski', position: 'DEF', rating: 77 },
    { name: 'Piotr Zieliński', position: 'MID', rating: 82 },
    { name: 'Nicola Zalewski', position: 'MID', rating: 78 },
    { name: 'Sebastian Szymański', position: 'MID', rating: 79 },
    { name: 'Robert Lewandowski', position: 'FWD', rating: 87 },
    { name: 'Krzysztof Piątek', position: 'FWD', rating: 76 },
    { name: 'Arkadiusz Milik', position: 'FWD', rating: 78 },
  ],
  dk: [
    { name: 'Kasper Schmeichel', position: 'GK', rating: 81 },
    { name: 'Andreas Christensen', position: 'DEF', rating: 82 },
    { name: 'Joachim Andersen', position: 'DEF', rating: 81 },
    { name: 'Simon Kjær', position: 'DEF', rating: 78 },
    { name: 'Joakim Mæhle', position: 'DEF', rating: 78 },
    { name: 'Pierre-Emile Højbjerg', position: 'MID', rating: 83 },
    { name: 'Christian Eriksen', position: 'MID', rating: 84 },
    { name: 'Mikkel Damsgaard', position: 'MID', rating: 80 },
    { name: 'Rasmus Højlund', position: 'FWD', rating: 83 },
    { name: 'Jonas Wind', position: 'FWD', rating: 78 },
    { name: 'Andreas Skov Olsen', position: 'FWD', rating: 78 },
  ],
  'gb-wls': [
    { name: 'Wayne Hennessey', position: 'GK', rating: 76 },
    { name: 'Ben Davies', position: 'DEF', rating: 78 },
    { name: 'Chris Mepham', position: 'DEF', rating: 76 },
    { name: 'Neco Williams', position: 'DEF', rating: 78 },
    { name: 'Connor Roberts', position: 'DEF', rating: 76 },
    { name: 'Aaron Ramsey', position: 'MID', rating: 82 },
    { name: 'Joe Allen', position: 'MID', rating: 76 },
    { name: 'Ethan Ampadu', position: 'MID', rating: 79 },
    { name: 'Gareth Bale', position: 'FWD', rating: 83 },
    { name: 'Daniel James', position: 'FWD', rating: 78 },
    { name: 'Kieffer Moore', position: 'FWD', rating: 76 },
  ],
  cr: [
    { name: 'Keylor Navas', position: 'GK', rating: 82 },
    { name: 'Óscar Duarte', position: 'DEF', rating: 76 },
    { name: 'Francisco Calvo', position: 'DEF', rating: 76 },
    { name: 'Kendall Waston', position: 'DEF', rating: 76 },
    { name: 'Ronald Matarrita', position: 'DEF', rating: 77 },
    { name: 'Yeltsin Tejeda', position: 'MID', rating: 76 },
    { name: 'Celso Borges', position: 'MID', rating: 75 },
    { name: 'Anthony Contreras', position: 'MID', rating: 75 },
    { name: 'Joel Campbell', position: 'FWD', rating: 78 },
    { name: 'Johan Venegas', position: 'FWD', rating: 75 },
    { name: 'Bryan Ruiz', position: 'FWD', rating: 76 },
  ],
  rs: [
    { name: 'Vanja Milinković-Savić', position: 'GK', rating: 80 },
    { name: 'Nikola Milenković', position: 'DEF', rating: 82 },
    { name: 'Strahinja Pavlović', position: 'DEF', rating: 80 },
    { name: 'Srđan Babić', position: 'DEF', rating: 76 },
    { name: 'Andrija Živković', position: 'DEF', rating: 78 },
    { name: 'Sergej Milinković-Savić', position: 'MID', rating: 85 },
    { name: 'Nemanja Gudelj', position: 'MID', rating: 77 },
    { name: 'Filip Kostić', position: 'MID', rating: 81 },
    { name: 'Dušan Vlahović', position: 'FWD', rating: 85 },
    { name: 'Aleksandar Mitrović', position: 'FWD', rating: 82 },
    { name: 'Dušan Tadić', position: 'FWD', rating: 80 },
  ],
  cm: [
    { name: 'André Onana', position: 'GK', rating: 82 },
    { name: 'Nicolas Nkoulou', position: 'DEF', rating: 76 },
    { name: 'Jean-Charles Castelletto', position: 'DEF', rating: 77 },
    { name: 'Collins Fai', position: 'DEF', rating: 75 },
    { name: 'Christopher Wooh', position: 'DEF', rating: 76 },
    { name: 'André-Frank Zambo Anguissa', position: 'MID', rating: 83 },
    { name: 'Martin Hongla', position: 'MID', rating: 76 },
    { name: 'Olivier Ntcham', position: 'MID', rating: 76 },
    { name: 'Vincent Aboubakar', position: 'FWD', rating: 79 },
    { name: 'Bryan Mbeumo', position: 'FWD', rating: 84 },
    { name: 'Karl Toko Ekambi', position: 'FWD', rating: 78 },
  ],
  qa: [
    { name: 'Meshaal Barsham', position: 'GK', rating: 77 },
    { name: 'Boualem Khoukhi', position: 'DEF', rating: 76 },
    { name: 'Pedro Miguel', position: 'DEF', rating: 76 },
    { name: 'Mohammed Waad', position: 'DEF', rating: 74 },
    { name: 'Homam Ahmed', position: 'DEF', rating: 74 },
    { name: 'Karim Boudiaf', position: 'MID', rating: 76 },
    { name: 'Abdulaziz Hatem', position: 'MID', rating: 76 },
    { name: 'Ismail Mohamad', position: 'MID', rating: 75 },
    { name: 'Hassan Al-Haydos', position: 'FWD', rating: 78 },
    { name: 'Akram Afif', position: 'FWD', rating: 81 },
    { name: 'Almoez Ali', position: 'FWD', rating: 79 },
  ],
  nz: [
    { name: 'Oliver Sail', position: 'GK', rating: 75 },
    { name: 'Michael Boxall', position: 'DEF', rating: 75 },
    { name: 'Liberato Cacace', position: 'DEF', rating: 78 },
    { name: 'Tim Payne', position: 'DEF', rating: 74 },
    { name: 'Bill Tuiloma', position: 'DEF', rating: 75 },
    { name: 'Joe Bell', position: 'MID', rating: 76 },
    { name: 'Callum McCowatt', position: 'MID', rating: 74 },
    { name: 'Sarpreet Singh', position: 'MID', rating: 76 },
    { name: 'Chris Wood', position: 'FWD', rating: 81 },
    { name: 'Ben Waine', position: 'FWD', rating: 76 },
    { name: 'Logan Rogerson', position: 'FWD', rating: 75 },
  ],
  cd: [
    { name: 'Lionel Mpasi', position: 'GK', rating: 76 },
    { name: 'Chancel Mbemba', position: 'DEF', rating: 80 },
    { name: 'Christian Luyindama', position: 'DEF', rating: 76 },
    { name: 'Arthur Masuaku', position: 'DEF', rating: 77 },
    { name: 'Aaron Tshibola', position: 'DEF', rating: 74 },
    { name: 'Samuel Moutoussamy', position: 'MID', rating: 77 },
    { name: 'Gaël Kakuta', position: 'MID', rating: 78 },
    { name: 'Silas Katompa Mvumpa', position: 'MID', rating: 79 },
    { name: 'Cédric Bakambu', position: 'FWD', rating: 77 },
    { name: 'Yannick Bolasie', position: 'FWD', rating: 74 },
    { name: 'Meschack Elia', position: 'FWD', rating: 76 },
  ],
  uz: [
    { name: 'Utkir Yusupov', position: 'GK', rating: 75 },
    { name: 'Abduqodir Khusanov', position: 'DEF', rating: 80 },
    { name: 'Sherzod Nasrullaev', position: 'DEF', rating: 75 },
    { name: 'Ruslanbek Jiyanov', position: 'DEF', rating: 74 },
    { name: 'Sardor Sabirkhodjaev', position: 'DEF', rating: 74 },
    { name: 'Azizbek Turgunboev', position: 'MID', rating: 76 },
    { name: 'Marufjon Yoqubov', position: 'MID', rating: 74 },
    { name: 'Abbosbek Fayzullaev', position: 'MID', rating: 79 },
    { name: 'Eldor Shomurodov', position: 'FWD', rating: 79 },
    { name: 'Jasur Yakhshiboev', position: 'FWD', rating: 76 },
    { name: 'Otabek Shukurov', position: 'FWD', rating: 74 },
  ],
  jo: [
    { name: 'Yazeed Abulaila', position: 'GK', rating: 75 },
    { name: 'Anas Bani Yaseen', position: 'DEF', rating: 76 },
    { name: 'Salem Al-Ajalin', position: 'DEF', rating: 75 },
    { name: 'Mohammad Abu Taha', position: 'DEF', rating: 74 },
    { name: 'Yazan Naimat', position: 'DEF', rating: 74 },
    { name: 'Ihsan Haddad', position: 'MID', rating: 76 },
    { name: 'Baha Faisal', position: 'MID', rating: 75 },
    { name: 'Noor Al-Rawabdeh', position: 'MID', rating: 75 },
    { name: 'Musa Al-Taamari', position: 'FWD', rating: 80 },
    { name: 'Ali Olwan', position: 'FWD', rating: 76 },
    { name: 'Yazan Al-Naimat', position: 'FWD', rating: 76 },
  ],
  iq: [
    { name: 'Fahad Talib', position: 'GK', rating: 75 },
    { name: 'Rebin Sulaka', position: 'DEF', rating: 75 },
    { name: 'Merchas Doski', position: 'DEF', rating: 75 },
    { name: 'Zaid Tahseen', position: 'DEF', rating: 74 },
    { name: 'Ahmed Maknzi', position: 'DEF', rating: 74 },
    { name: 'Amir Al-Ammari', position: 'MID', rating: 76 },
    { name: 'Ali Jasim', position: 'MID', rating: 75 },
    { name: 'Youssef Al-Amin', position: 'MID', rating: 75 },
    { name: 'Ayman Hussein', position: 'FWD', rating: 76 },
    { name: 'Mohanad Ali', position: 'FWD', rating: 75 },
    { name: 'Hussein Ali', position: 'FWD', rating: 74 },
  ],
  pa: [
    { name: 'Orlando Mosquera', position: 'GK', rating: 76 },
    { name: 'Fidel Escobar', position: 'DEF', rating: 76 },
    { name: 'Eric Davis', position: 'DEF', rating: 76 },
    { name: 'Michael Amir Murillo', position: 'DEF', rating: 78 },
    { name: 'César Blackman', position: 'DEF', rating: 74 },
    { name: 'Adalberto Carrasquilla', position: 'MID', rating: 77 },
    { name: 'José Luis Rodríguez', position: 'MID', rating: 76 },
    { name: 'Ismael Díaz', position: 'MID', rating: 76 },
    { name: 'Cecilio Waterman', position: 'FWD', rating: 77 },
    { name: 'Rolando Blackburn', position: 'FWD', rating: 76 },
    { name: 'Josimar Alcocer', position: 'FWD', rating: 74 },
  ],
  ht: [
    { name: 'Josué Duverger', position: 'GK', rating: 73 },
    { name: 'Carlens Arcus', position: 'DEF', rating: 75 },
    { name: 'Ricardo Adé', position: 'DEF', rating: 74 },
    { name: 'Steven Moreira', position: 'DEF', rating: 75 },
    { name: 'Bryan Alceus', position: 'DEF', rating: 74 },
    { name: 'Djimy Alexis', position: 'MID', rating: 75 },
    { name: 'Danley Jean Jacques', position: 'MID', rating: 74 },
    { name: 'Frantzdy Pierrot', position: 'MID', rating: 75 },
    { name: 'Duckens Nazon', position: 'FWD', rating: 77 },
    { name: 'Ruben Providence', position: 'FWD', rating: 74 },
    { name: 'Garven Metusala', position: 'FWD', rating: 74 },
  ],
  ba: [
    { name: 'Nikola Vasilj', position: 'GK', rating: 78 },
    { name: 'Toni Šunjić', position: 'DEF', rating: 77 },
    { name: 'Anel Ahmedhodžić', position: 'DEF', rating: 79 },
    { name: 'Sead Kolašinac', position: 'DEF', rating: 77 },
    { name: 'Amar Dedić', position: 'DEF', rating: 77 },
    { name: 'Rade Krunić', position: 'MID', rating: 78 },
    { name: 'Amer Gojak', position: 'MID', rating: 76 },
    { name: 'Ajdin Hasić', position: 'MID', rating: 75 },
    { name: 'Edin Džeko', position: 'FWD', rating: 82 },
    { name: 'Amar Rahmanović', position: 'FWD', rating: 76 },
    { name: 'Benjamin Tahirović', position: 'FWD', rating: 76 },
  ],
  cw: [
    { name: 'Eloy Room', position: 'GK', rating: 77 },
    { name: 'Cuco Martina', position: 'DEF', rating: 77 },
    { name: 'Darryl Lachman', position: 'DEF', rating: 75 },
    { name: 'Gino van Kessel', position: 'DEF', rating: 74 },
    { name: 'Elson Hooi', position: 'DEF', rating: 74 },
    { name: 'Juninho Bacuna', position: 'MID', rating: 78 },
    { name: 'Leandro Bacuna', position: 'MID', rating: 78 },
    { name: 'Godfried Roemeratoe', position: 'MID', rating: 75 },
    { name: 'Tahith Chong', position: 'FWD', rating: 79 },
    { name: 'Charlison Benschop', position: 'FWD', rating: 76 },
    { name: 'Rangelo Janga', position: 'FWD', rating: 75 },
  ],
};

// ============================================================
// TRANSFER MARKET — real star players, big price tags. Seeded once
// as free agents with a "cost" field; /player sign deducts coins for
// these instead of being free like custom-made players.
// ============================================================
const STAR_PLAYERS = [
  { name: 'Jude Bellingham', position: 'MID', rating: 90, cost: 250000000 },
  { name: 'Kylian Mbappé', position: 'FWD', rating: 93, cost: 300000000 },
  { name: 'Erling Haaland', position: 'FWD', rating: 92, cost: 280000000 },
  { name: 'Bukayo Saka', position: 'FWD', rating: 88, cost: 200000000 },
  { name: 'Jamal Musiala', position: 'MID', rating: 89, cost: 220000000 },
  { name: 'Pedri', position: 'MID', rating: 87, cost: 180000000 },
  { name: 'Neymar Jr', position: 'FWD', rating: 88, cost: 150000000 },
  { name: 'Lionel Messi', position: 'FWD', rating: 90, cost: 100000000 },
  { name: 'Cristiano Ronaldo', position: 'FWD', rating: 85, cost: 90000000 },
  { name: 'Vinícius Júnior', position: 'FWD', rating: 91, cost: 260000000 },
];
// Fallback for countries without a verified real roster — clearly
// fictional names (never a real athlete's name) so nobody gets falsely
// attributed to a national team without confirmation.
const GENERIC_FIRST_NAMES = ['Alex', 'Sam', 'Jordan', 'Chris', 'Kai', 'Milo', 'Theo', 'Luca', 'Nico', 'Ezra', 'Omar', 'Iker', 'Rafa', 'Tomas', 'Diego'];
const GENERIC_LAST_NAMES = ['Rivera', 'Novak', 'Ferreira', 'Kowalski', 'Haddad', 'Larsen', 'Osei', 'Tanaka', 'Silva', 'Costa', 'Petrov', 'Cruz', 'Adeyemi', 'Moreau', 'Sato'];
function generateGenericSquad() {
  const positions = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
  return positions.map((position) => ({
    name: `${GENERIC_FIRST_NAMES[Math.floor(Math.random() * GENERIC_FIRST_NAMES.length)]} ${GENERIC_LAST_NAMES[Math.floor(Math.random() * GENERIC_LAST_NAMES.length)]}`,
    position,
    rating: 60 + Math.floor(Math.random() * 26),
  }));
}
function getDefaultSquad(countryCode) {
  return DEFAULT_SQUADS[countryCode] || generateGenericSquad();
}

function seedStarPlayers() {
  if (data.starPlayersSeeded) return;
  for (const p of STAR_PLAYERS) {
    const id = makePlayerId(p.name);
    data.players[id] = { id, name: p.name, position: p.position, rating: p.rating, cost: p.cost, ownerId: null };
  }
  data.starPlayersSeeded = true;
  saveData(data);
}

// ============================================================
// MATCH ENGINE — goal generation, scorer commentary, animation
// ============================================================
const GOAL_WEIGHTS = [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];
function baseGoalCount() { return GOAL_WEIGHTS[Math.floor(Math.random() * GOAL_WEIGHTS.length)]; }

function applyBoostsToGoals(userId, goals) {
  const boosts = getBoosts(userId);
  let result = goals;
  if (boosts.starStriker) { result += 1; delete boosts.starStriker; }
  if (boosts.luckyCharm) { result += 1; delete boosts.luckyCharm; }
  return result;
}
function applyOpponentReduction(userId, goals) {
  const boosts = getBoosts(userId);
  let result = goals;
  if (boosts.ironWall) { result = Math.max(0, result - 1); delete boosts.ironWall; }
  return result;
}

function pickScorer(squadPlayers, teamName) {
  const outfield = squadPlayers.filter((p) => p.position !== 'GK');
  const pool = outfield.length ? outfield : squadPlayers;
  if (pool.length === 0) return `A ${teamName} player`;
  return pool[Math.floor(Math.random() * pool.length)].name;
}
function pickGoalkeeper(squadPlayers, teamName) {
  const gk = squadPlayers.find((p) => p.position === 'GK');
  return gk ? gk.name : `The ${teamName} keeper`;
}
function pickDefender(squadPlayers, teamName) {
  const defs = squadPlayers.filter((p) => p.position === 'DEF' || p.position === 'MID');
  const pool = defs.length ? defs : squadPlayers;
  if (pool.length === 0) return `A ${teamName} defender`;
  return pool[Math.floor(Math.random() * pool.length)].name;
}

function generateGoalEvents(goalCount, squadPlayers, teamName, side, oppSquad, oppTeamName) {
  const events = [];
  for (let i = 0; i < goalCount; i++) {
    const isPenalty = Math.random() < 0.15;
    const isStoppage = Math.random() < 0.15;
    const minute = isStoppage ? 90 + Math.floor(Math.random() * 8) + 1 : Math.floor(Math.random() * 90) + 1;
    const scorer = pickScorer(squadPlayers, teamName);
    if (isPenalty) {
      // VAR review precedes the penalty goal, same minute, added first so it commentates before the goal
      events.push({ minute, side, type: 'var_penalty_awarded', player: scorer, foulBy: pickDefender(oppSquad, oppTeamName) });
    }
    events.push({ minute, side, type: 'goal', player: scorer, isPenalty });
  }
  return events;
}

// Extra time (91'-105', 106'-120') sees fewer goals than a normal 45 — weighted low
const ET_GOAL_WEIGHTS = [0, 0, 0, 0, 0, 1, 1, 2];
function extraTimeGoalCount() { return ET_GOAL_WEIGHTS[Math.floor(Math.random() * ET_GOAL_WEIGHTS.length)]; }
function generateExtraTimeGoalEvents(goalCount, squadPlayers, teamName, side, oppSquad, oppTeamName, minMinute, maxMinute) {
  const events = [];
  for (let i = 0; i < goalCount; i++) {
    const minute = minMinute + Math.floor(Math.random() * (maxMinute - minMinute + 1));
    const isPenalty = Math.random() < 0.15;
    const scorer = pickScorer(squadPlayers, teamName);
    if (isPenalty) {
      events.push({ minute, side, type: 'var_penalty_awarded', player: scorer, foulBy: pickDefender(oppSquad, oppTeamName), et: true });
    }
    events.push({ minute, side, type: 'goal', player: scorer, isPenalty, et: true });
  }
  return events;
}
function generateFlavorEvents(squadA, squadB, teamAName, teamBName) {
  const events = [];
  const flavorCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < flavorCount; i++) {
    const minute = Math.floor(Math.random() * 90) + 1;
    const side = Math.random() < 0.5 ? 'A' : 'B';
    const squad = side === 'A' ? squadA : squadB;
    const teamName = side === 'A' ? teamAName : teamBName;
    const oppSquad = side === 'A' ? squadB : squadA;
    const oppTeamName = side === 'A' ? teamBName : teamAName;
    const roll = Math.random();
    if (roll < 0.35) {
      events.push({ minute, side, type: 'save', player: pickScorer(squad, teamName), gk: pickGoalkeeper(oppSquad, oppTeamName) });
    } else if (roll < 0.55) {
      events.push({ minute, side, type: 'card', player: pickScorer(squad, teamName), card: Math.random() < 0.15 ? 'red' : 'yellow' });
    } else if (roll < 0.7) {
      events.push({ minute, side, type: 'foul', player: pickDefender(oppSquad, oppTeamName), against: pickScorer(squad, teamName) });
    } else if (roll < 0.85) {
      // VAR checks a penalty shout but it's not given
      events.push({ minute, side, type: 'var_no_penalty', player: pickScorer(squad, teamName) });
    } else {
      // VAR gives the penalty, but it's missed or saved — doesn't change the score
      const outcome = Math.random() < 0.5 ? 'saved' : 'missed';
      events.push({ minute, side, type: 'var_penalty_missed', player: pickScorer(squad, teamName), gk: pickGoalkeeper(oppSquad, oppTeamName), outcome });
    }
  }
  return events;
}

function formatMinute(minute) {
  if (minute > 90) return `90+${minute - 90}'`;
  return `${minute}'`;
}
function commentaryLine(ev) {
  const minStr = ev.et ? `${ev.minute}' (ET)` : formatMinute(ev.minute);
  if (ev.type === 'goal') {
    return `⚽ ${minStr} — **${ev.player}** rushes through, dribbles past the defense and SCORES${ev.isPenalty ? ' from the spot' : ''}!`;
  }
  if (ev.type === 'save') {
    return `🧤 ${minStr} — **${ev.player}** shoots... but it's saved brilliantly by **${ev.gk}**!`;
  }
  if (ev.type === 'foul') {
    return `🟨 ${minStr} — **${ev.player}** brings down **${ev.against}** — foul given.`;
  }
  if (ev.type === 'var_penalty_awarded') {
    return `📺 ${minStr} — **${ev.foulBy}** fouls **${ev.player}** in the box! Referee is called to the monitor...\n🟢 VAR confirms it — PENALTY AWARDED!`;
  }
  if (ev.type === 'var_no_penalty') {
    return `📺 ${minStr} — Shouts for a penalty as **${ev.player}** goes down in the box...\n🔴 VAR review: no infringement, play continues.`;
  }
  if (ev.type === 'var_penalty_missed') {
    return `📺 ${minStr} — Penalty awarded to **${ev.player}**'s side after a VAR review!\n${ev.outcome === 'saved' ? `🧤 The spot-kick is saved by **${ev.gk}**!` : '❌ The penalty goes wide — missed!'}`;
  }
  return `${ev.card === 'red' ? '🟥' : '🟨'} ${minStr} — **${ev.player}** is shown a ${ev.card} card.`;
}

// Sends a commentary line; goals and saves get a gif attached and a
// scorer credit toward the all-time Golden Boot / Ballon d'Or tallies.
async function sendEventLine(channel, ev, scoreLine) {
  const text = commentaryLine(ev) + (scoreLine ? `\n${scoreLine}` : '');
  if (ev.type === 'goal') {
    recordGoal(ev.player);
    await channel.send({ embeds: [new EmbedBuilder().setDescription(text).setImage(randomGif(GOAL_GIFS)).setColor(0x2ecc71)] });
  } else if (ev.type === 'save') {
    await channel.send({ embeds: [new EmbedBuilder().setDescription(text).setImage(randomGif(SAVE_GIFS)).setColor(0x3498db)] });
  } else {
    await channel.send(text);
  }
}

// Groups scorers by player for the final result screen, e.g. "K. Mbappé 48', 66'"
function formatScorerList(goalEvents) {
  const byPlayer = {};
  for (const ev of goalEvents) {
    if (ev.type !== 'goal') continue; // skip the paired VAR narrative entries, only count real goals
    byPlayer[ev.player] = byPlayer[ev.player] || [];
    byPlayer[ev.player].push(`${formatMinute(ev.minute)}${ev.isPenalty ? ' (P)' : ''}`);
  }
  const lines = Object.entries(byPlayer).map(([player, mins]) => `${player} ${mins.join(', ')}`);
  return lines.length ? lines.join('\n') : '—';
}

// ============================================================
// HALF-TIME TRAINING WINDOW — a button each for TEAM A / TEAM B.
// Every click (10s cooldown per user) banks one "training point" for
// that side. More training points = more rolls at a bonus goal for
// the second half (see computeTrainingBonusGoals below).
// ============================================================
const HALF_TIME_BASE_MS = 25 * 1000; // 25 second core break
function computeTrainingBonusGoals(trainingCount) {
  // one bonus-goal "roll" per 3 training points banked, 40% each, capped at +2 goals
  let bonus = 0;
  const rolls = Math.floor(trainingCount / 3);
  for (let i = 0; i < rolls && bonus < 2; i++) {
    if (Math.random() < 0.4) bonus++;
  }
  return bonus;
}

async function runHalfTimeTraining(channel, teamA, teamB, runningA, runningB, teamAId, teamBId) {
  const addedSeconds = 5 + Math.floor(Math.random() * 11); // +5 to +15s added time
  const totalMs = HALF_TIME_BASE_MS + addedSeconds * 1000;
  const matchToken = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`train_A_${matchToken}`).setLabel(`🏋️ Train ${teamA.name}`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`train_B_${matchToken}`).setLabel(`🏋️ Train ${teamB.name}`).setStyle(ButtonStyle.Danger),
  );

  const halfTimeMsg = await channel.send({
    embeds: [new EmbedBuilder().setTitle('🟡 Half-Time')
      .setDescription(
        `**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**\n\n` +
        `⏱️ Added time for the break: **+${addedSeconds}s** (total break: ${Math.round(totalMs / 1000)}s)\n` +
        `Hit the buttons below to train your squad — every training rep improves that team's odds of a bonus goal in the second half! (10s cooldown per person)`
      )
      .setColor(0xf1c40f)],
    components: [row],
  });

  const trainingCounts = { A: 0, B: 0 };
  const lastClick = new Map(); // userId -> timestamp

  const collector = halfTimeMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: totalMs });
  collector.on('collect', async (btn) => {
    const side = btn.customId.startsWith('train_A_') ? 'A' : 'B';
    const ownerId = side === 'A' ? teamAId : teamBId;
    if (btn.user.id !== ownerId) {
      await btn.reply({ content: `🚫 Only the ${side === 'A' ? teamA.name : teamB.name} manager can train this team!`, ephemeral: true }).catch(() => {});
      return;
    }
    const now = Date.now();
    const last = lastClick.get(btn.user.id) || 0;
    if (now - last < 10 * 1000) {
      const waitSec = Math.ceil((10 * 1000 - (now - last)) / 1000);
      await btn.reply({ content: `⏳ Catch your breath! Wait ${waitSec}s before training again.`, ephemeral: true }).catch(() => {});
      return;
    }
    lastClick.set(btn.user.id, now);
    trainingCounts[side]++;
    const teamName = side === 'A' ? teamA.name : teamB.name;
    await btn.reply({ content: `💪 Trained **${teamName}**! (${trainingCounts[side]} reps banked)`, ephemeral: true }).catch(() => {});
  });

  await new Promise((resolve) => collector.on('end', resolve));
  await halfTimeMsg.edit({ components: [] }).catch(() => {});

  return { trainingCounts, addedSeconds };
}

// ============================================================
// PRE-MATCH PREDICTION — one vote per person, changeable, 30s window
// ============================================================
async function runPrediction(channel, teamA, teamB) {
  const token = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`predict_A_${token}`).setLabel(`🔮 ${teamA.name}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`predict_B_${token}`).setLabel(`🔮 ${teamB.name}`).setStyle(ButtonStyle.Success),
  );
  const predictMsg = await channel.send({
    embeds: [new EmbedBuilder().setTitle('🔮 Who wins this one?')
      .setDescription(`Cast your prediction below! One vote per person — click again anytime to change it.\n⏱️ Voting closes in 30 seconds.`)
      .setColor(0x9b59b6)],
    components: [row],
  });

  const votes = new Map(); // userId -> 'A' | 'B'
  const collector = predictMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30 * 1000 });
  collector.on('collect', async (btn) => {
    const side = btn.customId.startsWith('predict_A_') ? 'A' : 'B';
    votes.set(btn.user.id, side);
    const teamName = side === 'A' ? teamA.name : teamB.name;
    await btn.reply({ content: `✅ Locked in: **${teamName}** to win!`, ephemeral: true }).catch(() => {});
  });

  await new Promise((resolve) => collector.on('end', resolve));
  await predictMsg.edit({ components: [] }).catch(() => {});

  let votesA = 0, votesB = 0;
  for (const side of votes.values()) { if (side === 'A') votesA++; else votesB++; }
  const total = votesA + votesB;
  const pctA = total ? Math.round((votesA / total) * 100) : 0;
  const pctB = total ? Math.round((votesB / total) * 100) : 0;
  await channel.send({
    embeds: [new EmbedBuilder().setTitle('🔮 Prediction Results')
      .setDescription(total ? `**${teamA.name}**: ${votesA} votes (${pctA}%)\n**${teamB.name}**: ${votesB} votes (${pctB}%)` : 'No predictions cast — bold silence from the crowd!')
      .setColor(0x9b59b6)],
  });
}

async function playMatch(channel, teamAId, teamBId, roundLabel, options = {}) {
  const isCity = options.isCity || false;
  const guildId = channel.guild?.id || channel.guildId;
  const teamA = isCity ? getCityTeam(teamAId) : getTeam(guildId, teamAId);
  const teamB = isCity ? getCityTeam(teamBId) : getTeam(guildId, teamBId);
  const squadA = isCity ? [] : getSquadPlayers(guildId, teamAId);
  const squadB = isCity ? [] : getSquadPlayers(guildId, teamBId);

  // ---- Cooldown: 30s minimum gap between matches in this channel ----
  const lastEnd = matchCooldowns.get(channel.id) || 0;
  const waitLeft = MATCH_COOLDOWN_MS - (Date.now() - lastEnd);
  if (waitLeft > 0) await delay(waitLeft);

  // ---- Pre-match prediction voting (one vote per person, changeable, 30s) ----
  try {
    await runPrediction(channel, teamA, teamB);
  } catch (err) {
    console.error('Prediction voting failed, continuing without it:', err);
  }

  let goalsA = applyBoostsToGoals(teamAId, baseGoalCount());
  let goalsB = applyBoostsToGoals(teamBId, baseGoalCount());
  goalsA = applyOpponentReduction(teamBId, goalsA); // teamB's ironWall reduces teamA's goals
  goalsB = applyOpponentReduction(teamAId, goalsB);

  const goalEventsA = generateGoalEvents(goalsA, squadA, teamA.name, 'A', squadB, teamB.name);
  const goalEventsB = generateGoalEvents(goalsB, squadB, teamB.name, 'B', squadA, teamA.name);
  const flavorEvents = generateFlavorEvents(squadA, squadB, teamA.name, teamB.name);
  const allEvents = [...goalEventsA, ...goalEventsB, ...flavorEvents].sort((a, b) => a.minute - b.minute);
  const firstHalfEvents = allEvents.filter((e) => e.minute <= 45);
  const secondHalfEvents = allEvents.filter((e) => e.minute > 45);

  const kickoffEmbed = new EmbedBuilder().setTitle(`⚽ ${roundLabel}: Kickoff!`).setDescription(`**${teamA.name}** vs **${teamB.name}**`).setColor(0x2ecc71);
  if (!isCity) kickoffEmbed.setThumbnail(cdnFlag(teamA.code));
  await channel.send({ embeds: [kickoffEmbed] });

  let runningA = 0, runningB = 0;

  for (const ev of firstHalfEvents) {
    await delay(2500);
    if (ev.type === 'goal') { if (ev.side === 'A') runningA++; else runningB++; }
    const scoreLine = ev.type === 'goal' ? `**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**` : null;
    await sendEventLine(channel, ev, scoreLine);
  }

  // ---- Half-time: training window, then apply bonus goals to the second half ----
  let trainingCounts = { A: 0, B: 0 };
  let addedSeconds = 10;
  try {
    ({ trainingCounts, addedSeconds } = await runHalfTimeTraining(channel, teamA, teamB, runningA, runningB, teamAId, teamBId));
  } catch (err) {
    console.error('Half-time training failed, continuing without it:', err);
    await delay(HALF_TIME_BASE_MS);
  }

  const bonusA = computeTrainingBonusGoals(trainingCounts.A);
  const bonusB = computeTrainingBonusGoals(trainingCounts.B);
  if (bonusA > 0) {
    goalsA += bonusA;
    const bonusEvents = generateGoalEvents(bonusA, squadA, teamA.name, 'A', squadB, teamB.name)
      .map((e) => ({ ...e, minute: 46 + Math.floor(Math.random() * 44) }));
    goalEventsA.push(...bonusEvents);
    secondHalfEvents.push(...bonusEvents);
  }
  if (bonusB > 0) {
    goalsB += bonusB;
    const bonusEvents = generateGoalEvents(bonusB, squadB, teamB.name, 'B', squadA, teamA.name)
      .map((e) => ({ ...e, minute: 46 + Math.floor(Math.random() * 44) }));
    goalEventsB.push(...bonusEvents);
    secondHalfEvents.push(...bonusEvents);
  }
  secondHalfEvents.sort((a, b) => a.minute - b.minute);

  const kickoffLines = [`🟢 Second Half — Kickoff! (${addedSeconds}s added time played out at the break)`];
  if (bonusA > 0) kickoffLines.push(`🏋️ ${teamA.name}'s training paid off — **+${bonusA} bonus goal${bonusA > 1 ? 's' : ''}** coming their way!`);
  if (bonusB > 0) kickoffLines.push(`🏋️ ${teamB.name}'s training paid off — **+${bonusB} bonus goal${bonusB > 1 ? 's' : ''}** coming their way!`);
  if (bonusA === 0 && bonusB === 0) kickoffLines.push('No bonus goals earned from the training session — back to open play!');
  await channel.send({ embeds: [new EmbedBuilder().setTitle('🟢 Second Half').setDescription(kickoffLines.join('\n')).setColor(0x2ecc71)] });

  for (const ev of secondHalfEvents) {
    await delay(2500);
    if (ev.type === 'goal') { if (ev.side === 'A') runningA++; else runningB++; }
    const scoreLine = ev.type === 'goal' ? `**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**` : null;
    await sendEventLine(channel, ev, scoreLine);
  }
  await delay(1500);

  // ---- Extra Time: only if still level after 90+ ----
  if (goalsA === goalsB) {
    await channel.send({
      embeds: [new EmbedBuilder().setTitle('⏱️ Full-Time — Still Level!')
        .setDescription(`**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**\n\nHeading to Extra Time — two 15-minute halves!`)
        .setColor(0xe67e22)],
    });
    await delay(30000);

    // ET First Half: 91'-105'
    await channel.send({ embeds: [new EmbedBuilder().setTitle("🟠 Extra Time — First Half Kickoff! (91')").setColor(0xe67e22)] });
    const et1Events = [
      ...generateExtraTimeGoalEvents(extraTimeGoalCount(), squadA, teamA.name, 'A', squadB, teamB.name, 91, 105),
      ...generateExtraTimeGoalEvents(extraTimeGoalCount(), squadB, teamB.name, 'B', squadA, teamA.name, 91, 105),
    ].sort((a, b) => a.minute - b.minute);
    for (const ev of et1Events) {
      await delay(2500);
      if (ev.type === 'goal') {
        if (ev.side === 'A') { runningA++; goalsA++; goalEventsA.push(ev); } else { runningB++; goalsB++; goalEventsB.push(ev); }
      }
      const scoreLine = ev.type === 'goal' ? `**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**` : null;
      await sendEventLine(channel, ev, scoreLine);
    }

    // ET Half-Time
    await channel.send({
      embeds: [new EmbedBuilder().setTitle('🟡 Half-Time (Extra Time)')
        .setDescription(`**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**\n\nShort break — second period of extra time coming up!`)
        .setColor(0xf1c40f)],
    });
    await delay(30000);

    // ET Second Half: 106'-120'
    await channel.send({ embeds: [new EmbedBuilder().setTitle("🟠 Extra Time — Second Half Kickoff! (106')").setColor(0xe67e22)] });
    const et2Events = [
      ...generateExtraTimeGoalEvents(extraTimeGoalCount(), squadA, teamA.name, 'A', squadB, teamB.name, 106, 120),
      ...generateExtraTimeGoalEvents(extraTimeGoalCount(), squadB, teamB.name, 'B', squadA, teamA.name, 106, 120),
    ].sort((a, b) => a.minute - b.minute);
    for (const ev of et2Events) {
      await delay(2500);
      if (ev.type === 'goal') {
        if (ev.side === 'A') { runningA++; goalsA++; goalEventsA.push(ev); } else { runningB++; goalsB++; goalEventsB.push(ev); }
      }
      const scoreLine = ev.type === 'goal' ? `**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**` : null;
      await sendEventLine(channel, ev, scoreLine);
    }
    await delay(1500);
    await channel.send({
      embeds: [new EmbedBuilder().setTitle('🏁 End of Extra Time (120\')')
        .setDescription(`**${teamA.name}** ${runningA} - ${runningB} **${teamB.name}**`)
        .setColor(0xe67e22)],
    });
  }

  let penalties = null;
  let winnerId;
  if (goalsA === goalsB) {
    let penA = 0, penB = 0;
    for (let i = 0; i < 5; i++) { if (Math.random() < 0.75) penA++; if (Math.random() < 0.75) penB++; }
    while (penA === penB) { if (Math.random() < 0.5) penA++; else penB++; }
    penalties = { penA, penB };
    winnerId = penA > penB ? teamAId : teamBId;
  } else {
    winnerId = goalsA > goalsB ? teamAId : teamBId;
  }

  const resultEmbed = new EmbedBuilder()
    .setTitle(roundLabel)
    .setDescription(
      `**${teamA.name}**  ${goalsA} - ${goalsB}  **${teamB.name}**\n` +
      `🏁 Full-Time${penalties ? ` (pens: ${penalties.penA}-${penalties.penB})` : ''} • <t:${Math.floor(Date.now() / 1000)}:d>`
    )
    .addFields(
      { name: `${teamA.name} Scorers`, value: formatScorerList(goalEventsA), inline: true },
      { name: `${teamB.name} Scorers`, value: formatScorerList(goalEventsB), inline: true },
    )
    .setColor(0x2ecc71);
  if (!isCity) { resultEmbed.setAuthor({ name: teamA.name, iconURL: cdnFlag(teamA.code) }); resultEmbed.setThumbnail(cdnFlag(teamB.code)); }
  await channel.send({ embeds: [resultEmbed] });

  const loserId = winnerId === teamAId ? teamBId : teamAId;
  teamA.wins !== undefined && (winnerId === teamAId ? teamA.wins++ : teamA.losses++);
  teamB.wins !== undefined && (winnerId === teamBId ? teamB.wins++ : teamB.losses++);
  if (!isCity) addCoins(winnerId, 25); // city/league games are for fun only — no coin reward
  saveData(data);
  matchCooldowns.set(channel.id, Date.now());

  return {
    goalsA, goalsB, penalties, winnerId,
    teamAId, teamBId, goalEventsA, goalEventsB,
    keeperA: pickGoalkeeper(squadA, teamA.name),
    keeperB: pickGoalkeeper(squadB, teamB.name),
  };
}

// ============================================================
// INSTANT (unanimated) MATCH — used for group-stage fixtures, so a
// full group phase doesn't take forever to play through
// ============================================================
function simulateMatchInstant(teamAId, teamBId) {
  let goalsA = applyBoostsToGoals(teamAId, baseGoalCount());
  let goalsB = applyBoostsToGoals(teamBId, baseGoalCount());
  goalsA = applyOpponentReduction(teamBId, goalsA);
  goalsB = applyOpponentReduction(teamAId, goalsB);
  return { goalsA, goalsB };
}

// ============================================================
// TOURNAMENT — group stage (optional) + knockout bracket
// ============================================================
function roundNameForSize(size) {
  if (size >= 32) return 'Round of 32';
  if (size === 16) return 'Round of 16';
  if (size === 8) return 'Quarterfinals';
  if (size === 4) return 'Semifinals';
  if (size === 2) return 'Final';
  return `Round of ${size}`;
}
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function buildKnockoutRound(participants) {
  const shuffled = shuffle(participants);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) matches.push({ p1: shuffled[i], p2: shuffled[i + 1], winner: null, result: null });
  return matches;
}
function tournamentDisplayName(t) {
  if (t.type === 'worldcup') return `FIFA World Cup ${new Date().getFullYear()}™`;
  if (t.type === 'championsleague') return 'UEFA Champions League';
  if (t.type === 'europaleague') return 'UEFA Europa League';
  if (t.type === 'copaamerica') return 'Copa América';
  if (t.type === 'euros') return 'UEFA European Championship';
  if (t.type === 'afcon') return 'Africa Cup of Nations';
  return t.name;
}
function getTournament(guildId) { return data.tournaments[guildId] || null; }
async function getTournamentChannel(guild) {
  const t = getTournament(guild.id);
  if (!t?.channelId) return null;
  return guild.channels.cache.get(t.channelId) || await guild.channels.fetch(t.channelId).catch(() => null);
}

function buildRoundRobin(group) {
  const matches = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) matches.push({ p1: group[i], p2: group[j], played: false, goalsA: null, goalsB: null });
  }
  return matches;
}
function groupStandings(group, matches) {
  const table = {};
  for (const id of group) table[id] = { id, pts: 0, gf: 0, ga: 0, played: 0 };
  for (const m of matches) {
    if (!m.played) continue;
    table[m.p1].played++; table[m.p2].played++;
    table[m.p1].gf += m.goalsA; table[m.p1].ga += m.goalsB;
    table[m.p2].gf += m.goalsB; table[m.p2].ga += m.goalsA;
    if (m.goalsA > m.goalsB) table[m.p1].pts += 3;
    else if (m.goalsA < m.goalsB) table[m.p2].pts += 3;
    else { table[m.p1].pts += 1; table[m.p2].pts += 1; }
  }
  return Object.values(table).sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || (b.gf - a.gf));
}

// Accumulates scorer/keeper/concede stats from a playMatch result onto
// the tournament object, so end-of-tournament awards can be computed.
function recordTournamentMatchStats(t, result) {
  t.tourneyGoals = t.tourneyGoals || {};
  t.tourneyGoalEvents = t.tourneyGoalEvents || [];
  t.concededByTeam = t.concededByTeam || {};
  t.keeperByTeam = t.keeperByTeam || {};

  for (const ev of result.goalEventsA.filter((e) => e.type === 'goal')) {
    t.tourneyGoals[ev.player] = (t.tourneyGoals[ev.player] || 0) + 1;
    t.tourneyGoalEvents.push({ player: ev.player, minute: ev.minute, et: !!ev.et, isPenalty: !!ev.isPenalty, teamId: result.teamAId });
  }
  for (const ev of result.goalEventsB.filter((e) => e.type === 'goal')) {
    t.tourneyGoals[ev.player] = (t.tourneyGoals[ev.player] || 0) + 1;
    t.tourneyGoalEvents.push({ player: ev.player, minute: ev.minute, et: !!ev.et, isPenalty: !!ev.isPenalty, teamId: result.teamBId });
  }
  t.concededByTeam[result.teamAId] = (t.concededByTeam[result.teamAId] || 0) + result.goalsB;
  t.concededByTeam[result.teamBId] = (t.concededByTeam[result.teamBId] || 0) + result.goalsA;
  t.keeperByTeam[result.teamAId] = result.keeperA;
  t.keeperByTeam[result.teamBId] = result.keeperB;
}

async function startNextKnockoutMatch(guild) {
  const t = getTournament(guild.id);
  if (!t || t.status !== 'knockout') return;
  const round = t.rounds[t.rounds.length - 1];
  const idx = round.findIndex((m) => !m.winner);

  if (idx === -1) {
    const winners = round.map((m) => m.winner);

    // Semifinals just finished (2 matches, 4 teams) — play the third-place
    // playoff between the two losers before moving on to the Final.
    if (round.length === 2 && !t.thirdPlacePlayed) {
      t.thirdPlacePlayed = true;
      const losers = round.map((m) => (m.winner === m.p1 ? m.p2 : m.p1));
      saveData(data);
      const channel = await getTournamentChannel(guild);
      if (channel) {
        await channel.send({ embeds: [new EmbedBuilder().setTitle('🥉 Third Place Playoff').setColor(0xcd7f32)] });
        const thirdResult = await playMatch(channel, losers[0], losers[1], 'Third Place Playoff');
        recordTournamentMatchStats(t, thirdResult);
        addCoins(thirdResult.winnerId, 5000000);
        await channel.send({ embeds: [new EmbedBuilder().setTitle(`🥉 ${getTeam(guild.id, thirdResult.winnerId).name} takes third place!`).setDescription('+5,000,000 coins').setColor(0xcd7f32)] });
      }
    }

    if (winners.length === 1) { await crownChampion(guild, winners[0]); return; }
    t.rounds.push(buildKnockoutRound(winners));
    saveData(data);
    const channel = await getTournamentChannel(guild);
    if (channel) await channel.send({ embeds: [new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — ${roundNameForSize(winners.length)} begins!`).setColor(0x3498db)] });
    return startNextKnockoutMatch(guild);
  }

  const match = round[idx];
  const channel = await getTournamentChannel(guild);
  if (!channel) return;
  const result = await playMatch(channel, match.p1, match.p2, roundNameForSize(round.length * 2));
  recordTournamentMatchStats(t, result);
  match.winner = result.winnerId;
  match.result = result;
  saveData(data);
  await startNextKnockoutMatch(guild);
}

// End-of-tournament individual awards: Golden Boot, Ballon d'Or, the ultra-rare
// Super Ballon d'Or, Golden Glove, and Goal of the Tournament.
async function announceTournamentAwards(guild, t) {
  const channel = await getTournamentChannel(guild);
  if (!channel) return;
  const goalEntries = Object.entries(t.tourneyGoals || {}).sort((a, b) => b[1] - a[1]);
  if (goalEntries.length === 0) return; // no scorer data captured — nothing to award

  const guildId = guild.id;
  const topScorer = goalEntries[0];
  const goldenBootTies = goalEntries.filter(([, g]) => g === topScorer[1]).map(([n]) => n);

  // Ballon d'Or — goals-weighted, with a bonus for being on the champion squad
  const champSquadNames = new Set(getSquadPlayers(guildId, t.champion).map((p) => p.name));
  const ballonDorRanked = goalEntries.map(([n, g]) => [n, g * 10 + (champSquadNames.has(n) ? 15 : 0)]).sort((a, b) => b[1] - a[1]);
  const ballonDorWinner = ballonDorRanked[0]?.[0] || topScorer[0];

  // Super Ballon d'Or — a legendary honor, only handed out once every
  // 5 completed tournaments in this server (regardless of stats).
  const completedCount = data.tournamentsCompleted[guildId] || 0;
  const superAwarded = completedCount > 0 && completedCount % 5 === 0;

  // Golden Glove — best defensive record across the tournament
  let gloveLine = 'Not enough data to award.';
  const concedeEntries = Object.entries(t.concededByTeam || {}).sort((a, b) => a[1] - b[1]);
  if (concedeEntries.length) {
    const [bestTeamId, conceded] = concedeEntries[0];
    const keeperName = (t.keeperByTeam || {})[bestTeamId] || 'Unknown';
    const teamName = getTeam(guildId, bestTeamId)?.name || 'Unknown';
    gloveLine = `**${keeperName}** (${teamName}) — only ${conceded} conceded all tournament`;
  }

  // Goal of the Tournament — weighted toward extra-time / stoppage-time / open-play strikes
  let gotLine = 'No goals scored — a defensive masterclass all tournament!';
  if (t.tourneyGoalEvents?.length) {
    const weighted = t.tourneyGoalEvents.map((e) => ({ ...e, weight: 1 + (e.et ? 2 : 0) + (e.minute > 90 ? 1 : 0) + (e.isPenalty ? 0 : 1) }));
    let r = Math.random() * weighted.reduce((s, e) => s + e.weight, 0);
    let picked = weighted[0];
    for (const e of weighted) { r -= e.weight; if (r <= 0) { picked = e; break; } }
    const teamName = getTeam(guildId, picked.teamId)?.name || '';
    gotLine = `**${picked.player}** (${teamName}) — ${picked.et ? `${picked.minute}' (ET)` : formatMinute(picked.minute)}${picked.isPenalty ? ' from the spot' : ''}`;
  }

  await channel.send({
    embeds: [new EmbedBuilder().setTitle('🏅 Tournament Awards').setColor(0xf1c40f)
      .addFields(
        { name: '👟 Golden Boot', value: `${goldenBootTies.join(', ')} — ${topScorer[1]} goal${topScorer[1] > 1 ? 's' : ''}` },
        { name: "🥇 Ballon d'Or", value: `**${ballonDorWinner}**` },
        { name: "🌟 Super Ballon d'Or", value: superAwarded ? `**${ballonDorWinner}** — awarded once every 5 tournaments, and this is the one!` : `Not this time — only handed out every 5th tournament (${5 - (completedCount % 5)} to go).` },
        { name: '🏆 FIFA Best Player', value: `**${ballonDorWinner}**` },
        { name: '🧤 Golden Glove', value: gloveLine },
        { name: '🎯 Goal of the Tournament', value: gotLine },
      )],
  });
}

async function crownChampion(guild, championId) {
  const t = getTournament(guild.id);
  t.status = 'completed';
  t.champion = championId;
  const champTeam = getTeam(guild.id, championId);
  champTeam.trophies += 1;
  const CHAMPION_PRIZE_COINS = 53000000;
  addCoins(championId, CHAMPION_PRIZE_COINS);
  data.tournamentsCompleted[guild.id] = (data.tournamentsCompleted[guild.id] || 0) + 1;
  saveData(data);

  // The prize role is an ultra-rare 1-in-1000 bonus, not guaranteed
  let wonRole = false;
  if (t.prizeRoleId && Math.random() < 1 / 1000) {
    wonRole = true;
    const member = await guild.members.fetch(championId).catch(() => null);
    if (member) await member.roles.add(t.prizeRoleId).catch(() => {});
  }

  const channel = await getTournamentChannel(guild);
  if (channel) {
    const desc = `Prize: ${t.prize}\n+${CHAMPION_PRIZE_COINS.toLocaleString()} coins awarded.` +
      (t.prizeRoleId ? (wonRole ? '\n🎉 INCREDIBLE — also won the ultra-rare (1/1000) tournament role!' : '\n(Missed the 1/1000 chance at the bonus tournament role — so close!)') : '');
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(`🏆🎉 ${champTeam.name} WINS ${tournamentDisplayName(t)}!`)
        .setDescription(desc).setThumbnail(cdnFlag(champTeam.code)).setColor(0xffd700)],
    });
  }
  await announceTournamentAwards(guild, t);
}

// Groups-only format: no knockout bracket — crown the top team of each
// group once all group matches are played.
async function crownGroupWinners(guild, t) {
  t.status = 'completed';
  const letters = 'ABCDEFGH';
  const winners = t.groups.map((g, i) => groupStandings(g, t.groupMatches[i])[0]?.id).filter(Boolean);
  t.champions = winners;
  const CHAMPION_PRIZE_COINS = winners.length > 1 ? 20000000 : 53000000;
  const lines = [];
  for (const winnerId of winners) {
    const team = getTeam(guild.id, winnerId);
    if (!team) continue;
    team.trophies += 1;
    addCoins(winnerId, CHAMPION_PRIZE_COINS);
    lines.push(`🏆 **${team.name}** — Group ${letters[t.groups.findIndex((g) => g.includes(winnerId))]} Champions (+${CHAMPION_PRIZE_COINS.toLocaleString()} coins)`);
  }
  saveData(data);
  const channel = await getTournamentChannel(guild);
  if (channel) {
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(`🏆🎉 ${tournamentDisplayName(t)} — Group Stage Complete!`)
        .setDescription(lines.join('\n') || 'No group winners could be determined.').setColor(0xffd700)],
    });
  }
}

// ============================================================
// SLASH COMMANDS
// ============================================================
const sizeChoices = [
  { name: 'Round of 32 (32 teams)', value: '32' }, { name: 'Round of 16 (16 teams)', value: '16' },
  { name: 'Quarterfinals (8 teams)', value: '8' }, { name: 'Semifinals (4 teams)', value: '4' },
];
const formatChoices = [
  { name: 'Group Stage → Knockout', value: 'groups_knockout' },
  { name: 'Group Stage Only (no knockout)', value: 'groups_only' },
];
const typeChoices = [
  { name: 'FIFA World Cup', value: 'worldcup' }, { name: 'Champions League', value: 'championsleague' },
  { name: 'Europa League', value: 'europaleague' }, { name: 'Copa América', value: 'copaamerica' },
  { name: 'UEFA Euros', value: 'euros' }, { name: 'Africa Cup of Nations', value: 'afcon' },
  { name: 'Custom', value: 'custom' },
];
const positionChoices = [
  { name: 'Goalkeeper (GK)', value: 'GK' }, { name: 'Defender (DEF)', value: 'DEF' },
  { name: 'Midfielder (MID)', value: 'MID' }, { name: 'Forward (FWD)', value: 'FWD' },
];
const shopChoices = [
  { name: 'Star Striker — +1 guaranteed goal next match', value: 'starstriker' },
  { name: "Iron Wall — -1 opponent's goals next match", value: 'ironwall' },
  { name: 'Lucky Charm — +1 head-start goal next match', value: 'luckycharm' },
  { name: 'Double Daily — next /daily pays double', value: 'doubledaily' },
];

const slashCommands = [
  new SlashCommandBuilder().setName('help').setDescription('List all commands.'),

  new SlashCommandBuilder().setName('team').setDescription('Manage your national team.')
    .addSubcommand((s) => s.setName('set').setDescription('Choose the country you represent.')
      .addStringOption((o) => o.setName('country').setDescription('Country name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('profile').setDescription("View a team's profile.")
      .addUserOption((o) => o.setName('user').setDescription('Whose profile').setRequired(false))),

  new SlashCommandBuilder().setName('createplayer').setDescription('Create a custom player. Admin only.')
    .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true))
    .addStringOption((o) => o.setName('position').setDescription('Position').setRequired(true).addChoices(...positionChoices))
    .addIntegerOption((o) => o.setName('rating').setDescription('Rating 40-99 (default random 60-90)').setRequired(false).setMinValue(40).setMaxValue(99)),

  new SlashCommandBuilder().setName('player').setDescription('Squad management.')
    .addSubcommand((s) => s.setName('sign').setDescription('Sign a free-agent player to your squad (max 11).')
      .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('release').setDescription('Release a player from your squad back to free agency.')
      .addStringOption((o) => o.setName('name').setDescription('Player name').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('squad').setDescription("View a team's squad.")
      .addUserOption((o) => o.setName('user').setDescription('Whose squad').setRequired(false)))
    .addSubcommand((s) => s.setName('list').setDescription('List free-agent players available to sign.')),

  new SlashCommandBuilder().setName('balance').setDescription('Check your coin balance.'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily coins.'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Top players.')
    .addStringOption((o) => o.setName('type').setDescription('Rank by').setRequired(true)
      .addChoices({ name: 'coins', value: 'coins' }, { name: 'trophies', value: 'trophies' }, { name: 'golden boot (goals)', value: 'goldenboot' }, { name: "ballon d'or", value: 'ballondor' })),

  new SlashCommandBuilder().setName('teamcreator').setDescription('Create a custom city/club team for league games (no country restriction).')
    .addSubcommand((s) => s.setName('create').setDescription('Create or rename your custom team.')
      .addStringOption((o) => o.setName('name').setDescription('Any team name you want').setRequired(true)))
    .addSubcommand((s) => s.setName('profile').setDescription("View a custom team's profile.")
      .addUserOption((o) => o.setName('user').setDescription('Whose team').setRequired(false))),

  new SlashCommandBuilder().setName('citymatch').setDescription('Play a league game between custom teams — no cooldown, no coins, just for fun.')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to play').setRequired(true)),

  new SlashCommandBuilder().setName('matchsim').setDescription('Play a full animated friendly match against another team.')
    .addUserOption((o) => o.setName('opponent').setDescription('Who to play').setRequired(true)),
  new SlashCommandBuilder().setName('penalty').setDescription('Take a 5-kick penalty shootout for coins.'),
  new SlashCommandBuilder().setName('var').setDescription('Call for a VAR review on your last result.'),
  new SlashCommandBuilder().setName('card').setDescription('Give someone a joke yellow or red card.')
    .addUserOption((o) => o.setName('user').setDescription('Who to card').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('The "offense"').setRequired(false)),
  new SlashCommandBuilder().setName('chant').setDescription("Generate your team's fan chant."),

  new SlashCommandBuilder().setName('shop').setDescription('Transfer market — spend coins on boosts.')
    .addSubcommand((s) => s.setName('view').setDescription('See what the market is selling.'))
    .addSubcommand((s) => s.setName('buy').setDescription('Buy an item.')
      .addStringOption((o) => o.setName('item').setDescription('Item to buy').setRequired(true).addChoices(...shopChoices))),

  new SlashCommandBuilder().setName('tournament').setDescription('Tournament commands.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a new tournament. Admin only.')
      .addStringOption((o) => o.setName('type').setDescription('Tournament type').setRequired(true).addChoices(...typeChoices))
      .addStringOption((o) => o.setName('format').setDescription('Group Stage → Knockout, or Group Stage Only').setRequired(true).addChoices(...formatChoices))
      .addStringOption((o) => o.setName('prize').setDescription('Prize description').setRequired(true))
      .addStringOption((o) => o.setName('size').setDescription('Knockout bracket size (only needed for Group→Knockout or direct knockout)').setRequired(false).addChoices(...sizeChoices))
      .addStringOption((o) => o.setName('name').setDescription('Custom name (only used if type = Custom)').setRequired(false))
      .addRoleOption((o) => o.setName('prize_role').setDescription('Role to award the champion').setRequired(false)))
    .addSubcommand((s) => s.setName('join').setDescription('Join the open tournament.'))
    .addSubcommand((s) => s.setName('leave').setDescription('Leave the open tournament.'))
    .addSubcommand((s) => s.setName('creategroups').setDescription('Split registered teams into groups. Admin only.')
      .addIntegerOption((o) => o.setName('num_groups').setDescription('How many groups').setRequired(true).setMinValue(2).setMaxValue(8)))
    .addSubcommand((s) => s.setName('playgroups').setDescription('Simulate all remaining group-stage matches. Admin only.'))
    .addSubcommand((s) => s.setName('standings').setDescription('View group stage standings.'))
    .addSubcommand((s) => s.setName('advancegroups').setDescription('Advance top teams from groups into the knockout bracket. Admin only.')
      .addIntegerOption((o) => o.setName('top').setDescription('How many teams advance per group').setRequired(true).setMinValue(1).setMaxValue(4)))
    .addSubcommand((s) => s.setName('start').setDescription('Skip groups and start the knockout bracket directly. Admin only.'))
    .addSubcommand((s) => s.setName('bracket').setDescription('View the current knockout bracket.'))
    .addSubcommand((s) => s.setName('status').setDescription('View tournament status.'))
    .addSubcommand((s) => s.setName('end').setDescription('Cancel the current tournament. Admin only.')),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
  console.log(`Registered ${slashCommands.length} guild slash commands.`);
}
client.once('ready', async () => { console.log(`Logged in as ${client.user.tag}`); await registerCommands(); seedStarPlayers(); });

const SHOP_PRICES = { starstriker: 80, ironwall: 80, luckycharm: 120, doubledaily: 50 };
const DAILY_AMOUNT = 250000;
const VAR_OUTCOMES = [
  '🟩 VAR confirms the original decision. No change.',
  '🟥 VAR overturns it! That result is getting reviewed by the panel.',
  '📺 VAR is taking a while... the referee is checking the monitor... decision stands.',
  '🎥 After a lengthy review, VAR sides with the referee. Play on.',
];
const CHANTS = [
  '🎶 Ohhh {team}, we love you! 🎶', '🎶 {team}, {team}, {team}! 🎶',
  '🎶 We are the {team}, the mighty mighty {team}! 🎶',
  '🎶 Que sera sera, whatever will be, {team} in the final, {team} in the final! 🎶',
  '🎶 Allez, allez, allez! {team} till we die! 🎶',
];
const CARD_QUOTES = { yellow: ['a reckless challenge', 'excessive celebrating', 'dissent', 'time-wasting'], red: ['a two-footed lunge', 'violent conduct', 'denying a clear goalscoring opportunity'] };

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);
      if (interaction.commandName === 'team' && focused.name === 'country') {
        const q = focused.value.toLowerCase();
        await interaction.respond(COUNTRIES.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 25).map((c) => ({ name: c.name, value: c.code })));
        return;
      }
      if (interaction.commandName === 'player' && focused.name === 'name') {
        const q = focused.value.toLowerCase();
        const sub = interaction.options.getSubcommand();
        let pool;
        if (sub === 'sign') pool = Object.values(data.players).filter((p) => !p.ownerId && !p.isNational);
        else pool = getSquadPlayers(interaction.guildId, interaction.user.id);
        const matches = pool.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 25).map((p) => ({ name: `${p.name} (${p.position}, ${p.rating})`, value: p.name }));
        await interaction.respond(matches);
        return;
      }
      await interaction.respond([]);
      return;
    }

    if (!interaction.isChatInputCommand() || !interaction.guild) return;
    const name = interaction.commandName;
    const sub = interaction.options.getSubcommand(false);

    if (name === 'help') {
      await interaction.reply({
        ephemeral: true,
        content: '```\n' +
          'COMMANDS:\n' +
          '/team set, /team profile\n' +
          '/createplayer, /player sign/release/squad/list\n' +
          '/balance, /daily, /leaderboard\n' +
          '/matchsim (full animated friendly), /penalty\n' +
          '/var, /card, /chant\n' +
          '/shop view, /shop buy\n' +
          '/tournament create/join/leave/creategroups/playgroups/\n' +
          '            standings/advancegroups/start/bracket/status/end\n' +
          '```',
      });
      return;
    }

    if (name === 'team') {
      if (sub === 'set') {
        const code = interaction.options.getString('country');
        const country = COUNTRIES.find((c) => c.code === code);
        if (!country) { await interaction.reply({ content: 'Pick a country from the list.', ephemeral: true }); return; }
        if (isCountryTaken(interaction.guild.id, code, interaction.user.id)) {
          await interaction.reply({ content: `🚫 **${country.name}** is already taken by another player in this server. Pick a different country.`, ephemeral: true });
          return;
        }
        const guildTeams = getGuildTeams(interaction.guild.id);
        const existing = guildTeams[interaction.user.id] || { wins: 0, losses: 0, trophies: 0, squad: [] };
        const isCountryChange = existing.code && existing.code !== country.code;

        // Switching nations removes the old national-squad players entirely —
        // they never enter free agency (they just get regenerated fresh for
        // whoever picks that country next).
        if (isCountryChange && existing.squad?.length) {
          for (const playerId of existing.squad) {
            delete data.players[playerId];
          }
          existing.squad = [];
        }

        guildTeams[interaction.user.id] = { ...existing, code: country.code, name: country.name };
        const team = guildTeams[interaction.user.id];

        let squadNote = '';
        if (!team.squad || team.squad.length === 0) {
          team.squad = [];
          const roster = getDefaultSquad(country.code);
          for (const p of roster) {
            const id = makePlayerId(p.name);
            data.players[id] = { id, name: p.name, position: p.position, rating: p.rating, ownerId: interaction.user.id, isNational: true };
            team.squad.push(id);
          }
          squadNote = DEFAULT_SQUADS[country.code]
            ? `\nYour squad has been auto-filled with ${country.name}'s starting XI!`
            : `\nYour squad has been auto-filled with a generated 11 (no verified real roster on file for ${country.name} — you can /player release and sign real ones instead).`;
        } else if (isCountryChange) {
          squadNote = "\nYour previous squad was released — sign a fresh one with /player sign.";
        }
        saveData(data);
        await interaction.reply({ content: `✅ You now represent **${country.name}** in this server!${squadNote}`, embeds: [new EmbedBuilder().setThumbnail(cdnFlag(country.code)).setColor(0x2ecc71)] });
        return;
      }
      if (sub === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const team = getTeam(interaction.guild.id, target.id);
        if (!team) { await interaction.reply(`${target.username} hasn't picked a team in this server yet — use /team set.`); return; }
        const embed = new EmbedBuilder().setTitle(`${team.name} — ${target.username}`).setThumbnail(cdnFlag(team.code))
          .addFields(
            { name: 'Wins', value: `${team.wins}`, inline: true }, { name: 'Losses', value: `${team.losses}`, inline: true },
            { name: '🏆 Trophies', value: `${team.trophies}`, inline: true }, { name: '💰 Coins', value: `${getCoins(target.id).toLocaleString()}`, inline: true },
            { name: 'Squad Size', value: `${(team.squad || []).length}/11`, inline: true },
          ).setColor(0x3498db);
        await interaction.reply({ embeds: [embed] });
        return;
      }
    }

    if (name === 'createplayer') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: 'Admin only.', ephemeral: true });
        return;
      }
      const pName = interaction.options.getString('name');
      const position = interaction.options.getString('position');
      const rating = interaction.options.getInteger('rating') || (60 + Math.floor(Math.random() * 31));
      const id = makePlayerId(pName);
      data.players[id] = { id, name: pName, position, rating, ownerId: null };
      saveData(data);
      await interaction.reply(`✅ Created **${pName}** (${position}, rating ${rating}) — now a free agent. Sign them with \`/player sign\`.`);
      return;
    }

    if (name === 'player') {
      if (sub === 'sign') {
        const pName = interaction.options.getString('name');
        const player = Object.values(data.players).find((p) => p.name.toLowerCase() === pName.toLowerCase() && !p.ownerId && !p.isNational);
        if (!player) { await interaction.reply({ content: 'No free-agent player with that name.', ephemeral: true }); return; }
        const team = getTeam(interaction.guild.id, interaction.user.id);
        if (!team) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
        team.squad = team.squad || [];
        if (team.squad.length >= 11) { await interaction.reply({ content: 'Your squad is full (11/11). Release someone first.', ephemeral: true }); return; }
        if (player.cost) {
          if (getCoins(interaction.user.id) < player.cost) {
            await interaction.reply({ content: `💸 **${player.name}** costs ${player.cost.toLocaleString()} coins (you have ${getCoins(interaction.user.id).toLocaleString()}).`, ephemeral: true });
            return;
          }
          addCoins(interaction.user.id, -player.cost);
        }
        player.ownerId = interaction.user.id;
        team.squad.push(player.id);
        saveData(data);
        await interaction.reply(`✅ Signed **${player.name}**${player.cost ? ` for ${player.cost.toLocaleString()} coins` : ''}! Squad: ${team.squad.length}/11.`);
        return;
      }
      if (sub === 'release') {
        const pName = interaction.options.getString('name');
        const team = getTeam(interaction.guild.id, interaction.user.id);
        const player = team?.squad?.map((id) => data.players[id]).find((p) => p?.name.toLowerCase() === pName.toLowerCase());
        if (!player) { await interaction.reply({ content: "That player isn't in your squad.", ephemeral: true }); return; }
        team.squad = team.squad.filter((id) => id !== player.id);
        if (player.isNational) {
          delete data.players[player.id]; // national-squad players never enter free agency
        } else {
          player.ownerId = null;
        }
        saveData(data);
        await interaction.reply(`✅ Released **${player.name}**${player.isNational ? '.' : ' back to free agency.'}`);
        return;
      }
      if (sub === 'squad') {
        const target = interaction.options.getUser('user') || interaction.user;
        const players = getSquadPlayers(interaction.guild.id, target.id);
        if (players.length === 0) { await interaction.reply(`${target.username} has no squad players yet.`); return; }
        const lines = players.map((p) => `${p.position} — ${p.name} (${p.rating})`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${getTeam(interaction.guild.id, target.id)?.name || target.username}'s Squad`).setDescription(lines.join('\n')).setColor(0x3498db)] });
        return;
      }
      if (sub === 'list') {
        const freeAgents = Object.values(data.players).filter((p) => !p.ownerId && !p.isNational);
        if (freeAgents.length === 0) { await interaction.reply('No free agents right now — create one with /createplayer.'); return; }
        const lines = freeAgents.slice(0, 40).map((p) => `${p.position} — ${p.name} (${p.rating})${p.cost ? ` — 💰 ${p.cost.toLocaleString()} coins` : ' — free'}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🆓 Transfer Market').setDescription(lines.join('\n')).setColor(0x95a5a6)] });
        return;
      }
    }

    if (name === 'balance') { await interaction.reply(`💰 You have **${getCoins(interaction.user.id).toLocaleString()} coins**.`); return; }
    if (name === 'daily') {
      const last = data.lastDaily[interaction.user.id] || 0;
      if (Date.now() - last < 24 * 60 * 60 * 1000) {
        const hrs = Math.ceil((24 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        await interaction.reply({ content: `⏳ Already claimed. Try again in ~${hrs}h.`, ephemeral: true });
        return;
      }
      const boosts = getBoosts(interaction.user.id);
      let amount = DAILY_AMOUNT;
      if (boosts.doubleDaily) { amount *= 2; delete boosts.doubleDaily; }
      data.lastDaily[interaction.user.id] = Date.now();
      addCoins(interaction.user.id, amount);
      saveData(data);
      await interaction.reply(`💰 Claimed **${amount.toLocaleString()} coins**! Balance: ${getCoins(interaction.user.id).toLocaleString()}.`);
      return;
    }
    if (name === 'leaderboard') {
      const type = interaction.options.getString('type');
      if (type === 'goldenboot' || type === 'ballondor') {
        const entries = Object.entries(data.playerGoals)
          .map(([player, goals]) => [player, type === 'ballondor' ? goals * 3 : goals])
          .sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (entries.length === 0) { await interaction.reply('No goals scored yet — get some matches going!'); return; }
        const unit = type === 'ballondor' ? 'pts' : 'goals';
        const lines = entries.map(([player, val], i) => `**${i + 1}.** ${player} — ${val} ${unit}`);
        const title = type === 'ballondor' ? "🥇 Ballon d'Or Race" : '👟 Golden Boot';
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(lines.join('\n')).setColor(0xf1c40f)] });
        return;
      }
      let entries = type === 'coins'
        ? Object.entries(data.coins).sort((a, b) => b[1] - a[1]).slice(0, 10)
        : Object.entries(data.teams).map(([id, t]) => [id, t.trophies]).sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (entries.length === 0) { await interaction.reply('No data yet.'); return; }
      const lines = await Promise.all(entries.map(async ([userId, val], i) => {
        const user = await client.users.fetch(userId).catch(() => null);
        return `**${i + 1}.** ${user ? user.username : 'Unknown'} — ${val} ${type === 'coins' ? 'coins' : 'trophies'}`;
      }));
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 Leaderboard — ${type}`).setDescription(lines.join('\n')).setColor(0xf1c40f)] });
      return;
    }

    if (name === 'matchsim') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.id === interaction.user.id) { await interaction.reply({ content: "You can't play yourself.", ephemeral: true }); return; }
      const myTeam = getTeam(interaction.guild.id, interaction.user.id);
      const oppTeam = getTeam(interaction.guild.id, opponent.id);
      if (!myTeam || !oppTeam) { await interaction.reply({ content: 'Both players need a team set (/team set) first.', ephemeral: true }); return; }
      const label = getDerbyName(myTeam.code, oppTeam.code) || 'Friendly Match';
      await interaction.reply(label !== 'Friendly Match' ? `🔥 **${label}** kicking off...` : '⚽ Kicking off...');
      await playMatch(interaction.channel, interaction.user.id, opponent.id, label);
      return;
    }

    if (name === 'teamcreator') {
      if (sub === 'create') {
        const teamName = interaction.options.getString('name').slice(0, 40);
        data.cityTeams[interaction.user.id] = { ...(data.cityTeams[interaction.user.id] || { wins: 0, losses: 0 }), name: teamName };
        saveData(data);
        await interaction.reply(`✅ Your custom team is now **${teamName}**! Use it in \`/citymatch\` — league games only, it can't join \`/tournament\` (that needs a real country from \`/team set\`).`);
        return;
      }
      if (sub === 'profile') {
        const target = interaction.options.getUser('user') || interaction.user;
        const team = getCityTeam(target.id);
        if (!team) { await interaction.reply(`${target.username} hasn't created a custom team yet — use /teamcreator create.`); return; }
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(team.name).addFields({ name: 'Wins', value: `${team.wins}`, inline: true }, { name: 'Losses', value: `${team.losses}`, inline: true }).setColor(0x9b59b6)] });
        return;
      }
    }

    if (name === 'citymatch') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.id === interaction.user.id) { await interaction.reply({ content: "You can't play yourself.", ephemeral: true }); return; }
      if (!getCityTeam(interaction.user.id) || !getCityTeam(opponent.id)) { await interaction.reply({ content: 'Both players need a custom team first — use /teamcreator create.', ephemeral: true }); return; }
      await interaction.reply('⚽ Kicking off a league game — no coins on the line, just bragging rights!');
      await playMatch(interaction.channel, interaction.user.id, opponent.id, 'League Game', { isCity: true });
      return;
    }

    if (name === 'penalty') {
      let scored = 0; const results = [];
      for (let i = 0; i < 5; i++) { const hit = Math.random() < 0.7; if (hit) scored++; results.push(hit ? '⚽' : '🧤'); }
      const coinsWon = scored * 10;
      addCoins(interaction.user.id, coinsWon);
      saveData(data);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🥅 Penalty Shootout').setDescription(`${results.join(' ')}\n\nScored **${scored}/5**! +${coinsWon} coins.`).setColor(0xf1c40f)] });
      return;
    }
    if (name === 'var') {
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('📺 VAR Review').setDescription(VAR_OUTCOMES[Math.floor(Math.random() * VAR_OUTCOMES.length)]).setColor(0x95a5a6)] });
      return;
    }
    if (name === 'card') {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const isRed = Math.random() < 0.2;
      const type = isRed ? 'red' : 'yellow';
      const offense = reason || CARD_QUOTES[type][Math.floor(Math.random() * CARD_QUOTES[type].length)];
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`${isRed ? '🟥' : '🟨'} ${isRed ? 'Red' : 'Yellow'} Card!`).setDescription(`${target} has been booked for **${offense}**.${isRed ? ' Off you go! 🚶' : ''}`).setColor(isRed ? 0xe74c3c : 0xf1c40f)] });
      return;
    }
    if (name === 'chant') {
      const team = getTeam(interaction.guild.id, interaction.user.id);
      if (!team) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
      await interaction.reply(CHANTS[Math.floor(Math.random() * CHANTS.length)].replace(/{team}/g, team.name));
      return;
    }

    if (name === 'shop') {
      if (sub === 'view') {
        const lines = [
          `**starstriker** — ${SHOP_PRICES.starstriker} coins — +1 guaranteed goal next match`,
          `**ironwall** — ${SHOP_PRICES.ironwall} coins — -1 opponent's goals next match`,
          `**luckycharm** — ${SHOP_PRICES.luckycharm} coins — +1 head-start goal next match`,
          `**doubledaily** — ${SHOP_PRICES.doubledaily} coins — next /daily claim pays double`,
        ];
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛒 Transfer Market').setDescription(lines.join('\n')).setColor(0x1abc9c)] });
        return;
      }
      if (sub === 'buy') {
        const item = interaction.options.getString('item');
        if (getCoins(interaction.user.id) < SHOP_PRICES[item]) { await interaction.reply({ content: `Need ${SHOP_PRICES[item]} coins.`, ephemeral: true }); return; }
        addCoins(interaction.user.id, -SHOP_PRICES[item]);
        const boosts = getBoosts(interaction.user.id);
        if (item === 'starstriker') boosts.starStriker = true;
        if (item === 'ironwall') boosts.ironWall = true;
        if (item === 'luckycharm') boosts.luckyCharm = true;
        if (item === 'doubledaily') boosts.doubleDaily = true;
        saveData(data);
        await interaction.reply(`✅ Purchased **${item}**! Applies automatically next time it's relevant.`);
        return;
      }
    }

    if (name === 'tournament') {
      const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
      const guildId = interaction.guild.id;

      if (sub === 'create') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const existingT = getTournament(guildId);
        if (existingT && existingT.status !== 'completed') { await interaction.reply({ content: 'A tournament is already active in this server. End it first.', ephemeral: true }); return; }
        const type = interaction.options.getString('type');
        const size = parseInt(interaction.options.getString('size') || '0', 10) || null;
        const format = interaction.options.getString('format') || 'groups_knockout';
        const prize = interaction.options.getString('prize');
        const customName = interaction.options.getString('name') || 'Custom Cup';
        const prizeRole = interaction.options.getRole('prize_role');
        data.tournaments[guildId] = {
          type, name: customName, prize, prizeRoleId: prizeRole?.id || null, size, format,
          status: 'registration', participants: [], groups: null, groupMatches: null, rounds: [], channelId: interaction.channel.id,
        };
        saveData(data);
        const t = data.tournaments[guildId];
        const displayName = tournamentDisplayName(t);
        const formatNote = format === 'groups_only'
          ? 'Format: **Group Stage Only** — no knockout, group winners are crowned directly.'
          : `Format: **Group Stage → Knockout** (need ${size || '2/4/8/16/32'} teams for the knockout stage, or run a group stage first with \`/tournament creategroups\`).`;
        await interaction.reply({
          embeds: [new EmbedBuilder().setTitle(`🏆 ${displayName}`)
            .setDescription(`Registration open!\n${formatNote}\nPrize: ${prize}\nJoin with \`/tournament join\` (set a team with \`/team set\` first).`)
            .setColor(0x3498db)],
        });
        return;
      }
      if (sub === 'join') {
        const t = getTournament(guildId);
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament open for registration.', ephemeral: true }); return; }
        if (!getTeam(guildId, interaction.user.id)) { await interaction.reply({ content: 'Set a team first with /team set.', ephemeral: true }); return; }
        if (t.participants.includes(interaction.user.id)) { await interaction.reply({ content: "You're already in.", ephemeral: true }); return; }
        t.participants.push(interaction.user.id);
        saveData(data);
        await interaction.reply(`✅ ${getTeam(guildId, interaction.user.id).name} joined! (${t.participants.length} teams so far)`);
        return;
      }
      if (sub === 'leave') {
        const t = getTournament(guildId);
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No open registration to leave.', ephemeral: true }); return; }
        t.participants = t.participants.filter((id) => id !== interaction.user.id);
        saveData(data);
        await interaction.reply('✅ You left the tournament.');
        return;
      }
      if (sub === 'creategroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = getTournament(guildId);
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament in registration — run `/tournament create` first, then `/tournament join`.', ephemeral: true }); return; }
        if (t.participants.length < 2) { await interaction.reply({ content: 'Need at least 2 registered teams before creating groups.', ephemeral: true }); return; }
        const numGroups = interaction.options.getInteger('num_groups');
        const shuffled = shuffle(t.participants);
        const groups = Array.from({ length: numGroups }, () => []);
        shuffled.forEach((id, i) => groups[i % numGroups].push(id));
        t.groups = groups;
        t.groupMatches = groups.map((g) => buildRoundRobin(g));
        t.status = 'groups';
        saveData(data);
        const letters = 'ABCDEFGH';
        const lines = groups.map((g, i) => `**Group ${letters[i]}:** ${g.map((id) => getTeam(guildId, id).name).join(', ')}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — Group Stage`).setDescription(lines.join('\n')).setColor(0x3498db)] });
        return;
      }
      if (sub === 'playgroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = getTournament(guildId);
        if (!t || t.status !== 'groups') { await interaction.reply({ content: 'No group stage in progress.', ephemeral: true }); return; }
        await interaction.reply('⏳ Simulating all remaining group matches...');
        for (const groupMatches of t.groupMatches) {
          for (const m of groupMatches) {
            if (m.played) continue;
            const result = simulateMatchInstant(m.p1, m.p2);
            m.goalsA = result.goalsA; m.goalsB = result.goalsB; m.played = true;
          }
        }
        saveData(data);
        if (t.format === 'groups_only') {
          await crownGroupWinners(interaction.guild, t);
          await interaction.followUp('✅ Group stage complete — winners crowned above!');
        } else {
          await interaction.followUp('✅ Group stage matches complete! Check `/tournament standings`, then `/tournament advancegroups` when ready for knockout.');
        }
        return;
      }
      if (sub === 'standings') {
        const t = getTournament(guildId);
        if (!t?.groups) { await interaction.reply({ content: 'No group stage set up.', ephemeral: true }); return; }
        const letters = 'ABCDEFGH';
        const embed = new EmbedBuilder().setTitle(`📊 ${tournamentDisplayName(t)} — Standings`).setColor(0x3498db);
        t.groups.forEach((g, i) => {
          const table = groupStandings(g, t.groupMatches[i]);
          const lines = table.map((row, pos) => `${pos + 1}. ${getTeam(guildId, row.id).name} — ${row.pts}pts (GD ${row.gf - row.ga})`);
          embed.addFields({ name: `Group ${letters[i]}`, value: lines.join('\n') });
        });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'advancegroups') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = getTournament(guildId);
        if (!t?.groups) { await interaction.reply({ content: 'No group stage set up.', ephemeral: true }); return; }
        if (t.format === 'groups_only') { await interaction.reply({ content: 'This tournament is Group-Stage-Only format — run `/tournament playgroups` to finish it up, no knockout needed.', ephemeral: true }); return; }
        const top = interaction.options.getInteger('top');
        const advancers = [];
        t.groups.forEach((g, i) => {
          const table = groupStandings(g, t.groupMatches[i]);
          advancers.push(...table.slice(0, top).map((row) => row.id));
        });
        if (![2, 4, 8, 16, 32].includes(advancers.length)) {
          await interaction.reply({ content: `Advancing produces ${advancers.length} teams, which isn't a valid knockout size (2/4/8/16/32). Adjust "top" or group count.`, ephemeral: true });
          return;
        }
        t.rounds = [buildKnockoutRound(advancers)];
        t.status = 'knockout';
        saveData(data);
        await interaction.reply(`✅ ${advancers.length} teams advance to the ${roundNameForSize(advancers.length)}! First match coming up...`);
        await startNextKnockoutMatch(interaction.guild);
        return;
      }
      if (sub === 'start') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        const t = getTournament(guildId);
        if (!t || t.status !== 'registration') { await interaction.reply({ content: 'No tournament in registration.', ephemeral: true }); return; }
        if (t.format === 'groups_only') { await interaction.reply({ content: 'This tournament is Group-Stage-Only format — use `/tournament creategroups` instead of `/tournament start`.', ephemeral: true }); return; }
        if (!t.size || t.participants.length !== t.size) { await interaction.reply({ content: `Need exactly ${t.size || 'a set number of'} participants (have ${t.participants.length}).`, ephemeral: true }); return; }
        t.rounds = [buildKnockoutRound(t.participants)];
        t.status = 'knockout';
        t.channelId = interaction.channel.id;
        saveData(data);
        await interaction.reply(`✅ ${tournamentDisplayName(t)} is starting! First match coming up...`);
        await startNextKnockoutMatch(interaction.guild);
        return;
      }
      if (sub === 'bracket' || sub === 'status') {
        const t = getTournament(guildId);
        if (!t) { await interaction.reply({ content: 'No tournament right now.', ephemeral: true }); return; }
        if (t.status === 'registration') { await interaction.reply(`**${tournamentDisplayName(t)}** — Registration: ${t.participants.length} teams joined.`); return; }
        if (t.status === 'groups') { await interaction.reply('Group stage in progress — use `/tournament standings`.'); return; }
        if (t.status === 'completed' && t.champions) {
          const names = t.champions.map((id) => getTeam(guildId, id)?.name || 'Unknown').join(', ');
          await interaction.reply(`**${tournamentDisplayName(t)}** — Completed! Group winners: ${names}`);
          return;
        }
        const currentRound = t.rounds[t.rounds.length - 1];
        const lines = currentRound.map((m) => {
          const p1Name = getTeam(guildId, m.p1)?.name || '???';
          const p2Name = getTeam(guildId, m.p2)?.name || '???';
          return m.winner ? `~~${p1Name} vs ${p2Name}~~ → **${getTeam(guildId, m.winner).name}**` : `${p1Name} vs ${p2Name}`;
        });
        const embed = new EmbedBuilder().setTitle(`🏆 ${tournamentDisplayName(t)} — ${roundNameForSize(currentRound.length * 2)}`).setDescription(lines.join('\n')).setColor(0x3498db);
        if (t.status === 'completed') embed.setFooter({ text: `Champion: ${getTeam(guildId, t.champion)?.name || 'Unknown'}` });
        await interaction.reply({ embeds: [embed] });
        return;
      }
      if (sub === 'end') {
        if (!isAdmin) { await interaction.reply({ content: 'Admin only.', ephemeral: true }); return; }
        data.tournaments[guildId] = null;
        saveData(data);
        await interaction.reply('✅ Tournament cancelled.');
        return;
      }
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    else await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
  }
});

client.login(process.env.BOT_TOKEN);
