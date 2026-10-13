import { CommandChoice } from "enmity/api/commands";
import { get } from "enmity/api/settings";


function getAllIds() {
    let aliasesStorage = get("ChatAliases", "aliases", "{\"use /setAlias\":\"use /setAlias\"}");
    let arr : CommandChoice[] = [];
    let aliases = JSON.parse(aliasesStorage?.toString() ?? "{\"use /setAlias\":\"use /setAlias\"}");
    let aliasesKeys = Object.keys(aliases);
    //const formattedList = Object.keys(aliases).map(id => ({
    //    name: id,
    //    displayName: id,
    //    value: id
    //}));
    for(let i = 0; i < aliasesKeys.length; i++) {
        arr.push({name: aliasesKeys[i], displayName: aliasesKeys[i], value: aliasesKeys[i]});
    }
    return arr;
}

export { getAllIds }    