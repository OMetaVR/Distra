import { metro } from "@vendetta";
import Settings from "./Settings";

const React = (window as any).React || metro.findByProps("createElement", "useState");

const { View, Text, ScrollView, TouchableOpacity, TextInput } =
  metro.findByProps("ScrollView", "TextInput") || metro.findByProps("View", "Text") || {};

const Navigation = metro.findByProps("push", "pushLazy", "pop");
const Navigator = metro.findByName("Navigator") ?? metro.findByProps("Navigator")?.Navigator;
const modalCloseButton =
  metro.findByProps("getRenderCloseButton")?.getRenderCloseButton ??
  metro.findByProps("getHeaderCloseButton")?.getHeaderCloseButton;

interface ModuleMatch {
  id: string;
  keys: string[];
  exports: any;
}

function MetroInspectorUI(): React.JSX.Element {
  const modules = metro.modules || (window as any).modules || {};
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const matches = React.useMemo(() => {
    if (!query || query.length < 2) return [];

    const list: ModuleMatch[] = [];
    const q = query.toLowerCase();

    for (const [id, mod] of Object.entries<any>(modules)) {
      if (list.length >= 50) break;

      const exports = mod?.publicModule?.exports || mod?.exports;
      if (!exports) continue;

      try {
        const keys = Object.keys(exports);
        const keysStr = keys.join(", ");

        if (keysStr.toLowerCase().includes(q) || id === query) {
          list.push({ id, keys, exports });
        }
      } catch (e) {}
    }
    return list;
  }, [query]);

  const activeDetail = React.useMemo(() => {
    if (!selectedId) return null;
    const mod = modules[selectedId];
    const exp = mod?.publicModule?.exports || mod?.exports;
    if (!exp) return "No exports available";

    try {
      const fullKeys = Object.keys(exp);
      const formatted = fullKeys
        .map((k) => ` • ${k}: <${typeof exp[k]}>`)
        .join("\n");

      return `Module ID: ${selectedId}\nTotal Keys: ${fullKeys.length}\n\nKeys & Types:\n${formatted}`;
    } catch (e: any) {
      return `Error inspecting module: ${e.message}`;
    }
  }, [selectedId]);

  return (
    <View style={{ flex: 1, backgroundColor: "#1e1f22", padding: 16 }}>
      <Text style={{ color: "#5865F2", fontSize: 22, fontWeight: "bold" }}>
        ⚡ Metro Explorer
      </Text>
      <Text style={{ color: "#949BA4", fontSize: 13, marginBottom: 12 }}>
        Loaded Modules: {Object.keys(modules).length}
      </Text>

      {TextInput && (
        <TextInput
          style={{
            backgroundColor: "#2b2d31",
            color: "#FFFFFF",
            padding: 12,
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 14,
          }}
          placeholder="Search export key or module ID..."
          placeholderTextColor="#949BA4"
          value={query}
          onChangeText={(text: string) => {
            setQuery(text);
            setSelectedId(null);
          }}
          autoCapitalize="none"
        />
      )}

      {selectedId ? (
        <View style={{ flex: 1, backgroundColor: "#111214", borderRadius: 8, padding: 12 }}>
          <TouchableOpacity
            style={{
              alignSelf: "flex-start",
              paddingVertical: 6,
              paddingHorizontal: 10,
              backgroundColor: "#2b2d31",
              borderRadius: 6,
              marginBottom: 10,
            }}
            onPress={() => setSelectedId(null)}
          >
            <Text style={{ color: "#5865F2", fontWeight: "bold" }}>← Back to List</Text>
          </TouchableOpacity>

          <ScrollView style={{ flex: 1 }}>
            <Text
              selectable
              style={{
                color: "#23a55a",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              {activeDetail}
            </Text>
          </ScrollView>
        </View>
      ) : (
        <ScrollView style={{ flex: 1, backgroundColor: "#2b2d31", borderRadius: 8, padding: 8 }}>
          {matches.length > 0 ? (
            matches.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: "#35363c",
                }}
                onPress={() => setSelectedId(item.id)}
              >
                <Text style={{ color: "#5865F2", fontWeight: "bold", fontSize: 14 }}>
                  [ID {item.id}] ({item.keys.length} keys)
                </Text>
                <Text
                  selectable
                  numberOfLines={3}
                  style={{
                    color: "#DBDEE1",
                    fontFamily: "monospace",
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  {item.keys.join(", ")}
                </Text>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={{ color: "#949BA4", fontSize: 13, padding: 12 }}>
              {query.length < 2
                ? "Type at least 2 characters to search exports..."
                : "No matching modules found."}
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export function openMetroExplorer(): void {
  if (!Navigation?.push || !Navigator) return;

  Navigation.push(() => (
    <Navigator
      initialRouteName="MetroExplorerModal"
      goBackOnBackPress
      screens={{
        MetroExplorerModal: {
          title: "Metro Explorer",
          headerLeft: modalCloseButton?.(() => Navigation.pop()),
          render: () => <MetroInspectorUI />,
        },
      }}
    />
  ));
}

export default {
  onLoad: () => {},
  onUnload: () => {},
  settings: Settings,
};
