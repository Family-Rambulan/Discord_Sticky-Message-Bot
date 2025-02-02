const findConfig = require("find-config");
require("dotenv").config({ path: findConfig(".env") });

const BotFunctions = require("./bot_functions.js");
const Colors = require("./messages/colors.js");

const AddCommand = require("./commands/add.js");
const AddFancyCommand = require("./commands/addfancy.js");
const EditCommand = require("./commands/edit.js");
const RemoveCommand = require("./commands/remove.js");
const RemoveAllCommand = require("./commands/removeall.js");
const PreviewCommand = require("./commands/preview.js");
const PreviewFancyCommand = require("./commands/previewfancy.js");
const ListCommand = require("./commands/list.js");

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const { Stickies } = require("./sticky.js");
global.stickies = new Stickies();

client.on("ready", () => {
  global.discordApplication = client.application;
  global.stickies.LoadStickies(client.guilds, () => {
    // Delete all Sticky bot messages in the last 50 messages for every server's channels
    for (const [server_id, server] of client.guilds.cache) {
      for (const [channel_id, channel] of server.channels.cache) {
        if (global.stickies.ValidStickyChannel(server_id, channel_id)) {
          try {
            channel.messages
              .fetch({ limit: 50 })
              .then((messages) => {
                for (const [_, message] of messages) {
                  if (
                    message.author.bot &&
                    message.author.id == global.discordApplication.id
                  ) {
                    //// Only remove sticky messages (So commands stay visible)
                    //if (message.embeds[0] == null)
                    BotFunctions.DeleteMessage(message);
                  }
                }
              })
              .then(() => {
                BotFunctions.ShowChannelStickies(server_id, channel, null);
              });
          } catch (error) {
            console.error(error.message);
          }
        }
      }
    }
  });

  console.log(`${client.user.tag} is online!`);
});

// Delete all stickies from a channel it's deleted
client.on("channelDelete", (channel) => {
  const server_id = channel.guild.id;
  global.stickies.RemoveChannelStickies(server_id, channel.id, () => {
    console.log(
      `Removed stickies for deleted channel ${channel.id} from server: ${server_id}`
    );
  });
});

// Delete all stickies from a server when it's deleted
client.on("guildDelete", (guild) => {
  global.stickies.RemoveServerStickies(guild.id, () => {
    console.log("Removed stickies from server: ", guild.id);
  });
});

client.on("messageCreate", (msg) => {
  // Originally it was gonna ignore all bots, but it probably makes more sense to just ignore itself
  //    if (msg.author.bot)
  //        return;
  if (msg.author.bot && msg.author.id == global.discordApplication.id) return;

  const msgParams = BotFunctions.GetCommandParamaters(msg.content);

  if (msgParams[0] == "!sticky") {
    if (!msg.member.permissions.has("MANAGE_CHANNELS")) {
      BotFunctions.SimpleMessage(
        msg.channel,
        "You need the 'Manage Channels' permission.",
        "Insufficient Privileges!",
        Colors["error"]
      );
      return;
    }

    switch (msgParams[1]) {
      case "add": // Add a sticky
        AddCommand.Run(client, msg);
        break;
      case "addfancy": // Add a fancy sticky
        AddFancyCommand.Run(client, msg);
        break;
      case "edit": // Modify channel sticky
        EditCommand.Run(client, msg);
        break;
      case "remove": // Remove a sticky
        RemoveCommand.Run(client, msg);
        break;
      case "removeall":
        RemoveAllCommand.Run(client, msg);
        break;
      case "preview":
        PreviewCommand.Run(client, msg);
        break;
      case "previewfancy":
        PreviewFancyCommand.Run(client, msg);
        break;
      case "list": // List stickies from channel or all channels with stickies
        ListCommand.Run(client, msg);
        break;
      default:
        msg.channel.send({
          embeds: [
            {
              title: "Commands",
              color: Colors["info"],
              fields: [
                {
                  name: "!sticky add <channel id> <discord message>",
                  value: "Add a sticky to a channel.",
                },
                {
                  name: "!sticky addfancy <channel id>",
                  value:
                    "Start the process of adding a fancy sticky to a channel.",
                },
                {
                  name: "!sticky edit <channel id> <sticky id>",
                  value:
                    "Start the modification process for the provided sticky.",
                },
                {
                  name: "!sticky remove <channel id> <sticky id>",
                  value: "Remove a sticky from a channel.",
                },
                {
                  name: "!sticky removeall <channel id>",
                  value: "Remove all stickies from a channel.",
                },
                {
                  name: "!sticky preview <message>",
                  value: "Preview what a sticky looks like.",
                },
                {
                  name: "!sticky previewfancy",
                  value:
                    "Start the process of creating and previewing a fancy sticky.",
                },
                {
                  name: "!sticky list <channel id>",
                  value: "List stickies in a channel.",
                },
                {
                  name: "!sticky list",
                  value: "List all channels with stickies.",
                },
              ],
            },
          ],
        });
    }
  } else {
    BotFunctions.ShowChannelStickies(msg.guild.id, msg.channel, null);
  }
});

client.login(process.env.BOT_TOKEN);
