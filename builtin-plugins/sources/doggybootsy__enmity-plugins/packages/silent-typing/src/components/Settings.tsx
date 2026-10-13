import { FormRow, FormSwitch } from "@lib/components/form";
import { SettingsStore } from "enmity/api/settings";

interface SettingsProps {
   settings: SettingsStore;
}

export default ({ settings }: SettingsProps) => {
  return <FormRow
    label="Example Setting"
    trailing={
      <FormSwitch
        value={settings.getBoolean("example", true)}
        onValueChange={() => settings.toggle("example", true)}
      />
    }
  />;
};