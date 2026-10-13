import { metro } from "@vendetta";

const React = (window as any).React || metro.findByProps("createElement", "useState");

const { View, Text, TextInput, TouchableOpacity, ScrollView } =
  metro.findByProps("ScrollView", "TextInput") || metro.findByProps("View", "Text") || {};

const Navigation = metro.findByProps("push", "pop");

interface EmbedModalProps {
  onSend: (formattedText: string) => void;
}

export default function EmbedModal({ onSend }: EmbedModalProps): React.JSX.Element {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [footer, setFooter] = React.useState("");
  const [accentSymbol, setAccentSymbol] = React.useState("▌");

  const buildMarkdownEmbed = () => {
    const lines: string[] = [];

    // Header / Title
    if (title.trim()) {
      lines.push(`### ${title.trim()}`);
    }

    // Body Description with Accent Sidebar
    if (description.trim()) {
      const descLines = description.trim().split("\n");
      descLines.forEach((line) => {
        lines.push(`> ${accentSymbol} ${line}`);
      });
    }

    // Footer
    if (footer.trim()) {
      lines.push(`> \u200B`);
      lines.push(`> _${footer.trim()}_`);
    }

    return lines.join("\n");
  };

  const handleSend = () => {
    const formatted = buildMarkdownEmbed();
    if (!formatted.trim()) return;

    onSend(formatted);
    if (Navigation?.pop) Navigation.pop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#1e1f22", padding: 16 }}>
      <Text style={{ color: "#5865F2", fontSize: 20, fontWeight: "bold", marginBottom: 12 }}>
        🛠️ Create User Embed
      </Text>

      <ScrollView style={{ flex: 1 }}>
        {/* Title Input */}
        <Text style={{ color: "#949BA4", fontSize: 12, marginBottom: 4 }}>EMBED TITLE</Text>
        <TextInput
          style={{
            backgroundColor: "#2b2d31",
            color: "#FFFFFF",
            padding: 10,
            borderRadius: 6,
            marginBottom: 12,
          }}
          placeholder="Enter embed title..."
          placeholderTextColor="#949BA4"
          value={title}
          onChangeText={setTitle}
        />

        {/* Accent Bar Symbol */}
        <Text style={{ color: "#949BA4", fontSize: 12, marginBottom: 4 }}>ACCENT STYLE</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          {["▌", "█", "▎", "||"].map((symbol) => (
            <TouchableOpacity
              key={symbol}
              style={{
                backgroundColor: accentSymbol === symbol ? "#5865F2" : "#2b2d31",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
              }}
              onPress={() => setAccentSymbol(symbol)}
            >
              <Text style={{ color: "#FFFFFF", fontWeight: "bold" }}>{symbol}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Description Input */}
        <Text style={{ color: "#949BA4", fontSize: 12, marginBottom: 4 }}>DESCRIPTION</Text>
        <TextInput
          style={{
            backgroundColor: "#2b2d31",
            color: "#FFFFFF",
            padding: 10,
            borderRadius: 6,
            marginBottom: 12,
            minHeight: 100,
            textAlignVertical: "top",
          }}
          placeholder="Enter embed body content..."
          placeholderTextColor="#949BA4"
          multiline
          value={description}
          onChangeText={setDescription}
        />

        {/* Footer Input */}
        <Text style={{ color: "#949BA4", fontSize: 12, marginBottom: 4 }}>FOOTER (OPTIONAL)</Text>
        <TextInput
          style={{
            backgroundColor: "#2b2d31",
            color: "#FFFFFF",
            padding: 10,
            borderRadius: 6,
            marginBottom: 16,
          }}
          placeholder="Footer text..."
          placeholderTextColor="#949BA4"
          value={footer}
          onChangeText={setFooter}
        />

        {/* Send Action */}
        <TouchableOpacity
          style={{
            backgroundColor: "#23a55a",
            padding: 12,
            borderRadius: 8,
            alignItems: "center",
          }}
          onPress={handleSend}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "bold", fontSize: 15 }}>Send Embed</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
