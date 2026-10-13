import { storage } from "@vendetta/plugin";

const pluginLogs = [];
const maxLogs = 1000;

function addLog(type, message, data = null) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: type,
    message: message,
    data: data
  };
  
  pluginLogs.unshift(logEntry);
  if (pluginLogs.length > maxLogs) {
    pluginLogs.pop();
  }
  
  if (storage?.settings?.enableUnsafeFeatures) {
    console.log(`[AccountSwitcher] ${type.toUpperCase()}: ${message}`, data || '');
  }
}

function getLogs() {
  return pluginLogs;
}

function clearLogs() {
  pluginLogs.length = 0;
  addLog('info', 'Logs cleared');
}

export { addLog, getLogs, clearLogs };