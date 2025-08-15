const {Client, Events, GatewayIntentBits, Collection} = require("discord.js");
const storage = require("node-persist");
const config = require("./config.json");
const colors = require("colors");
const path = require("path");
const fs = require("fs");

const TEST_BOT_ONLY = false;

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

    startup();
});

client.on(Events.Error, err => {
    console.log(err);
});

client.on(Events.InteractionCreate, async interaction => {
    if(!interaction.isChatInputCommand()) return;
    
    let cmd = client.commands.get(interaction.commandName);

    //Use if commands are loaded on seperate guilds
    //let cmd = interaction.client.commands.get(interaction.commandName);
    if(!cmd) return;

    try {
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


if(TEST_BOT_ONLY)
    client.login(config.token);
else {
    let tracker = require("./warTracker.js");
    tracker.main();
}