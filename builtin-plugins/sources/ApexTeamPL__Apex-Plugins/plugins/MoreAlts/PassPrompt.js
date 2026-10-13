import { React, ReactNative } from "@vendetta/metro/common";
import { showToast } from "@vendetta/ui/toasts";
import { simpleHash } from "./PasswordUtils.js";
import { addLog } from "./Logger.js";

function PasswordPrompt({ dialogInfo, onCancel, onSuccess, storage }) {
  const [passwordInput, setPasswordInput] = React.useState("");

  const handlePasswordDialog = () => {
    if (!passwordInput.trim()) {
      showToast("Please enter the password", 1);
      return;
    }
    
    const inputHash = simpleHash(passwordInput);
    if (inputHash === storage.settings.exportPasswordHash) {
      addLog('info', 'Password verification successful', { type: dialogInfo.type });
      onSuccess();
    } else {
      addLog('warn', 'Incorrect password attempt', { type: dialogInfo.type });
      showToast("Incorrect password", 1);
    }
  };

  return React.createElement(ReactNative.View, { 
    style: { flex: 1, backgroundColor: '#2f3136' } 
  }, [
    React.createElement(ReactNative.View, {
      key: "pwd-header",
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#202225',
        borderBottomWidth: 1,
        borderBottomColor: '#40444b'
      }
    }, [
      React.createElement(ReactNative.TouchableOpacity, {
        key: "back",
        onPress: onCancel,
        style: { marginRight: 16 }
      }, React.createElement(ReactNative.Text, {
        style: { color: '#7289da', fontSize: 16 }
      }, "← Cancel")),
      React.createElement(ReactNative.Text, {
        key: "title",
        style: { color: 'white', fontSize: 18, fontWeight: 'bold' }
      }, dialogInfo.title)
    ]),

    React.createElement(ReactNative.View, {
      key: "pwd-content",
      style: { flex: 1, padding: 16, justifyContent: 'center' }
    }, [
      React.createElement(ReactNative.Text, {
        key: "message",
        style: { color: '#b9bbbe', fontSize: 16, marginBottom: 20, textAlign: 'center' }
      }, dialogInfo.message),
      
      React.createElement(ReactNative.TextInput, {
        key: "password-input",
        placeholder: "Enter password",
        placeholderTextColor: '#72767d',
        value: passwordInput,
        onChangeText: setPasswordInput,
        secureTextEntry: true,
        style: {
          backgroundColor: '#40444b',
          color: 'white',
          padding: 16,
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 16
        }
      }),
      
      React.createElement(ReactNative.TouchableOpacity, {
        key: "confirm-btn",
        onPress: handlePasswordDialog,
        style: {
          backgroundColor: '#7289da',
          paddingVertical: 16,
          paddingHorizontal: 20,
          borderRadius: 8,
          alignItems: 'center'
        }
      }, React.createElement(ReactNative.Text, {
        style: { color: 'white', fontSize: 18, fontWeight: 'bold' }
      }, "Confirm"))
    ])
  ]);
}

export { PasswordPrompt };