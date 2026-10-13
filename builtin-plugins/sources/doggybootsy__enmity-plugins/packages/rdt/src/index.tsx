import { implementPlugin } from "@lib";

const connect = () => {
  const ip = window.enmity.settings.settings.enmity.debugWSAddress;

  const [ host ] = ip.split(":");
  // @ts-expect-error
  connectToDevTools({ host, port: 8097 })
}

implementPlugin({
  commands: [
    {
      name: "rdt",
      description: "Enable react developer tools",
      execute() {
        connect();
      }
    }
  ],
  onStart() {
    connect();
  },
});