const {Client, Events, GatewayIntentBits, Collection, MessageFlags, PermissionsBitField, ActivityType} = require("discord.js");
const database = require("./mongodb/database.js");
const storage = require("node-persist");
const config = require("./config.json");
const colors = require("colors");
const path = require("path");
const fs = require("fs");

/**
 * 0 - BOT AND TRACKER ARE ACTIVE
 * 1 - JUST THE BOT
 * 2 - JUST THE TRACKER
 */

const RUN_LEVEL = 0;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

process.env.TZ = 'America/Chicago';
client.commands = new Collection();
client.cooldowns = new Collection();

//Checks for all valid commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for(const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if("data" in command && "execute" in command) 
        client.commands.set(command.data.name, command);
    else
        console.log("[WARNING] ".bold.red + `- The command at ${filePath.yellow} is missing a required "data" or "execute" property.`);
}


// =====[ EVENTS ]===== //

client.once(Events.ClientReady, c => {
    console.log("===============\n".bold.green);
    console.log("> I'm now ONLINE!".bold.green);
    console.log(`> [COMMANDS LOADED] : ${client.commands.size}\n`.bold.yellow)
    console.log("===============\n".bold.green);

    client.user.setActivity("Link your account with /register", { type: ActivityType.Custom })
    startup();
});

client.on(Events.Error, err => {
    console.log(err);
});

client.on(Events.InteractionCreate, async interaction => {
    if(!interaction.isChatInputCommand()) return;
    
    let cmd = client.commands.get(interaction.commandName);
    //let cmd = interaction.client.commands.get(interaction.commandName); //Use if commands are loaded on seperate guilds
    if(!cmd) return;

    const { cooldowns } = interaction.client;

    if(!cooldowns.has(cmd.data.name))
        cooldowns.set(cmd.data.name, new Collection());

    const now = Date.now();
    const timestamps = cooldowns.get(cmd.data.name);
    const defaultCooldownDuration = 0;
    const cooldownAmount = (cmd.cooldown ?? defaultCooldownDuration) * 1_000;

    if(timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;

        if(now < expirationTime) {
            const expiredTimestamp = Math.round(expirationTime / 1_000);
            return interaction.reply({ content: `Please wait, you're currently on a cooldown for \`${cmd.data.name}\`. You can use it again <t:${expiredTimestamp}:R>`, flags: MessageFlags.Ephemeral });
        }
    }

    timestamps.set(interaction.user.id, now);
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);

    try {
        if(cmd.requirePermission == true) {
            const roles = await database.find(database.DATABASE_NAME.bot, database.COLLECTION.roles, { rolesList: true });
            if(!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && !interaction.member.roles.cache.has(roles.coLeader))
                return await interaction.reply({ content: "You don't have permisson to use this command.", flags: MessageFlags.Ephemeral })
        }
        await cmd.execute(interaction);
    } catch(err) {
        console.error(err);
        if(interaction.replied || interaction.deferred)
            await interaction.followUp({ content: 'There was an issue while using this command', ephemeral: true })
        else
            await interaction.reply({ content: 'There was an issue while using this command', ephemeral: true })
    }
});

/**
 * initizes the storage
 */
async function startup() {
    await storage.init(
        {
            stringify: JSON.stringify,
            parse: JSON.parse,
            encoding: "utf8",
            ttl: false
        });
}

let tracker = require("./warTracker.js");
switch(RUN_LEVEL) {
    case 0:
        client.login(config.token);
        tracker.main(client, true);
        break;

    case 1:
        client.login(config.token);
        break;

    case 2:
        tracker.main(client, true);
        break;
}

console.log(process.env.isUnusedAttackLogActive)