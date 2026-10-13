import { sendReply } from "enmity/api/clyde";
import { Command, ApplicationCommandOptionType, ApplicationCommandType, ApplicationCommandInputType } from "enmity/api/commands";
import { get, set } from "enmity/api/settings";
import { getAllIds } from "../getAllIds";

const removealias: Command = {
    id: "removealias-command",
    name: "removeAlias",
    displayName: "removeAlias",
    description: "removes one of your aliases in chat",
    displayDescription: "removes one of your aliases in chat",
    type: ApplicationCommandType.Chat,
    inputType: ApplicationCommandInputType.BuiltInText,
    options: [{
        name: "aliasid",
        displayName: "aliasid",
        description: "The ID of the alias to remove",
        displayDescription: "The ID of the alias to remove",
        type: ApplicationCommandOptionType.String,
        get choices() {
            return getAllIds();
        },
        required: true
    }],
    execute: async function (args, message) {
        const inputalias = args[args.findIndex(i => i.name === "aliasid")].value;
        
        let aliasesStorage = get("ChatAliases", "aliases", "{}");

        let aliases = JSON.parse(aliasesStorage?.toString() ?? "{}");
        if(!aliases[inputalias]) {
            sendReply(message?.channel.id ?? "0", "That alias does not exist");
            return;
        }
        
        delete aliases[inputalias];
        set("ChatAliases", "aliases", JSON.stringify(aliases));
        
        sendReply(message?.channel.id ?? "0", `The alias ${inputalias} has been deleted`);
    }
}


export { removealias }
