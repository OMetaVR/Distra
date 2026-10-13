import { ReactNative } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { useProxy } from "@vendetta/storage";
import { storage } from "@vendetta/plugin";
import { api } from "./index";

const { View, StyleSheet, TouchableOpacity } = ReactNative;
const { FormInput, FormText, FormDivider } = Forms;

const styles = StyleSheet.create({
  container: {
    padding: 16,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#5865F2",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonDisabled: {
    backgroundColor: "#4f545c",
  },
  buttonText: {
    color: "white",
    fontWeight: 'bold',
  },
  description: {
    marginTop: 24,
  },
});

export default () => {
  useProxy(storage);

  const handleTestAndSave = async () => {
    api.stopPolling();
    if (storage.serverUrl) {
      storage.serverUrl = storage.serverUrl.trim().replace(/\/$/, "");
    }
    const success = await api.authenticate();
    if (success) {
      api.startPolling();
    }
  };

  const isDisabled = !storage.serverUrl || !storage.username || !storage.password;

  return (
    <View style={styles.container}>
      <View style={styles.inputGroup}>
        <FormText>Server URL</FormText>
        <FormInput
          placeholder="https://abs.example.com"
          value={storage.serverUrl ?? ""}
          onChange={(v) => (storage.serverUrl = v)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <FormText>Username</FormText>
        <FormInput
          placeholder="your ABS username"
          value={storage.username ?? ""}
          onChange={(v) => (storage.username = v)}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <FormText>Password</FormText>
        <FormInput
          placeholder="your ABS password"
          value={storage.password ?? ""}
          onChange={(v) => (storage.password = v)}
          secureTextEntry
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isDisabled && styles.buttonDisabled]}
        onPress={handleTestAndSave}
        disabled={isDisabled}
      >
        <FormText style={styles.buttonText}>Login</FormText>
      </TouchableOpacity>
    </View>
  );
};