import { Plugin, registerPlugin } from 'enmity/managers/plugins';
import { React } from 'enmity/metro/common';
import manifest from '../manifest.json';
import { alias } from './components/alias';
import { removealias } from './components/removealias';
import { setalias } from './components/setalias';


const ChatAliases: Plugin = {
   ...manifest,

   onStart() {
      this.commands = [alias, setalias, removealias];
   },

   onStop() {
      this.commands = [];
   }
};

registerPlugin(ChatAliases);

