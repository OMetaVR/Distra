import { Constants, Dialog, Linking, NavigationNative, StyleSheet } from "enmity/metro/common";
import { getByProps } from "enmity/metro";
import { Button, Image, KeyboardAvoidingView, Pressable, ScrollView, View } from "enmity/components";

import { getIDByName } from "./assets";
import { discordInvite, git, manifest } from "./info";
import { FormDivider, FormRow, FormSection } from "./components/form";
import { reload } from "enmity/api/native";
import { ErrorBoundary, FallbackProps, openUserProfile } from "./util";
import type { SettingsStore } from "enmity/api/settings";
import { useState } from "react";

import { Pile, Text } from "./components/discord";

const Invites = getByProps("acceptInviteAndTransitionToInviteChannel");

const prettyName = manifest.name.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

const sheet = StyleSheet.createThemedStyleSheet({
  name: {
    color: Constants.ThemeColorMap.HEADER_PRIMARY
  },
  version: {
    color: Constants.ThemeColorMap.HEADER_SECONDARY
  },
  scroller: {
    flexGrow: 1,
    flexShrink: 1
  },
  info: {
    flexGrow: 0,
    flexShrink: 0
  },
  view: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 0
  }
});

const BUBBLE_SIZE = 32;

function Info() {
  return (
    <FormRow 
      style={sheet.info}
      label={(
        <>
          <Text variant="heading-lg/semibold" style={sheet.name}>{prettyName}</Text>
          <Text variant="text-md/normal" style={sheet.version}>v{manifest.version}</Text>
        </>
      )}
      // leading={<FormRow.Icon source={getIDByName("ic_activity_24px")} />}
      trailing={(
        <Pile size={BUBBLE_SIZE} gap={BUBBLE_SIZE / 8} depthX={.5} depthY={null} shape="circle">
          {manifest.authors.map(({ name, id }, index) => (
            <Pressable 
              onPress={() => {
                if (typeof id === "string") openUserProfile(id!);
                else Linking.openURL(`https://github.com/${name}`);
              }} 
              key={index}
            >
              <Image 
                src={`https://github.com/${name}.png`} 
                style={{
                  width: BUBBLE_SIZE, 
                  height: BUBBLE_SIZE, 
                  borderRadius: BUBBLE_SIZE
                }} 
              />
            </Pressable>
          ))}
        </Pile>
      )}
    />
  );
}

function Updater() {
  const navigation = NavigationNative.useNavigation();

  return (
    <FormSection title="Updater">
      <FormRow 
        label="Attempt to update"
        subLabel="Confirm both prompts to update"
        leading={<FormRow.Icon source={getIDByName("ic_sync_24px")} />}
        // disabled
        onPress={() => {
          (async function() {
            await window.enmity.plugins.uninstallPlugin(manifest.name);
            
            // Go back
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.pop();

            const [ user, repo ] = git.url.split("/").slice(-2);

            const url = `https://raw.githubusercontent.com/${user}/${repo}/refs/heads/${git.branch}/dist/${manifest.name}.js`;

            await window.enmity.plugins.installPlugin(`${url}?__random__${Math.random().toString(36).slice(2)}`, ({ data }: any) => {

              if (data === "installed_plugin") {
                Dialog.show({
                  title: "Installed successfully",
                  body: "Successfully installed plugin"
                });

                setTimeout(() => {
                  // If installed successfully reopen the page
                  navigation.push("EnmityCustomPage", {
                    pageName: manifest.name,
                    pagePanel: window.enmity.plugins.getPlugin(manifest.name).getSettingsPanel
                  });
                }, 10);

                return;
              }
              // Shouldnt be possible but
              // https://github.com/domi-btnr/Enmity-Stuff/blob/151b2cd98cd57b5653a61453f5beb2a7f098db89/common/pluginUpdater.ts#L117
              if (data === "overridden_plugin") {
                Dialog.show({
                  title: "Installed successfully",
                  body: "Successfully replaced plugin\nWould you like to reload Discord?",
                  confirmText: "Reload",
                  cancelText: "Later",
                  onConfirm: reload
                });

                return;
              }
              Dialog.show({
                title: "Installed Failed",
                body: "Was not able to update plugin"
              });
            });  
          })();
        }}
      />
    </FormSection>
  );
}

function Fallback({ error, info, self }: FallbackProps) {
  const navigation = NavigationNative.useNavigation();
  const [ viewStack, shouldViewStack ] = useState(false);

  return (
    <View 
      style={{
        borderWidth: 2,
        padding: 8,
        margin: 8,
        borderColor: "red",
        borderRadius: 8
      }}
    >
      <Text style={{ color: "red" }}>React Error</Text>
      <View>
        <Text>{error.message}</Text>
      </View>
      <Button 
        title="View Complete Error Info"
        onPress={() => shouldViewStack(v => !v)}
      />
      {viewStack && (error.stack || info.componentStack || info.digest) && (
        <View>
          {error.stack && <Text>{error.stack}</Text>}
          {info.digest && <Text>{info.digest}</Text>}
          {info.componentStack && <Text>{info.componentStack}</Text>}
        </View>
      )}
      <Button 
        title="Attempt Recovery"
        onPress={() => self.setState({ hasError: false })}
      />
      <Button 
        title="Exit Settings"
        onPress={() => {
          // Go back
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.pop();
        }}
      />
      <Button 
        title="Reload"
        onPress={() => reload()}
      />
    </View>
  )
}

export function SettingsPanel({ settings, children }: React.PropsWithChildren<{ settings: SettingsStore }>) {
  const icons = {
		GitHub: getIDByName("img_account_sync_github_white"),
		Discord: getIDByName("Discord"),
	};
  
  return (
    <View style={sheet.view}>
      <Info />
      <ScrollView style={sheet.scroller}>
        <KeyboardAvoidingView
          enabled
          behavior="position"
          contentContainerStyle={{ backfaceVisibility: "hidden" }}
        >
          <Updater />
          <FormSection title="Links">
            <FormRow 
              label="Support Server"
              leading={<FormRow.Icon source={icons.Discord} />}
              trailing={FormRow.Arrow}
              onPress={() => {
                Invites.acceptInviteAndTransitionToInviteChannel({
                  inviteKey: discordInvite,
                  context: { location: "Invite Button Embed" },
                  callback: () => { }
                });
              }}
            />
            <FormDivider />
            <FormRow 
              label="Source"
              leading={<FormRow.Icon source={icons.GitHub} />}
              trailing={FormRow.Arrow}
              onPress={() => {
                const [ user, repo ] = git.url.split("/").slice(-2);

                Linking.openURL(`https://github.com/${user}/${repo}/tree/${git.branch}/packages/${manifest.name}/`);
              }}
            />
          </FormSection>
          <ErrorBoundary fallback={Fallback}>
            {children}
          </ErrorBoundary>
          <View style={{ height: 50 }} />
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  )
}