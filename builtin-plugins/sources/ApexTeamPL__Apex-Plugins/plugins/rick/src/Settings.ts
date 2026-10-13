import { React } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";

const { FormSection, FormRow, FormText } = Forms;

export default function Settings() {
    return React.createElement(FormSection, { title: "🎵 Rickroll Plugin Settings" },
        React.createElement(FormRow, {
            label: "How to use",
            trailing: FormRow.Arrow
        },
            React.createElement(FormText, null,
                "Type \"/rick\" or \"/rickroll\" in any channel! Your message becomes rickroll text and YOU hear the sound locally."
            )
        ),
        
        React.createElement(FormRow, {
            label: "Features",
            trailing: FormRow.Arrow
        },
            React.createElement(FormText, null,
                "• Plays audio locally (only you hear it)\n" +
                "• Replaces your message with rickroll text\n" +
                "• Works in any Discord channel\n" +
                "• Multiple backup audio sources\n" +
                "• Fallback beep sound if audio fails"
            )
        ),
        
        React.createElement(FormRow, {
            label: "Pro Tips",
            trailing: FormRow.Arrow
        },
            React.createElement(FormText, null,
                "• Use \"/rick\" for a quick rickroll\n" +
                "• Perfect for pranking friends\n" +
                "• The element of surprise is key!\n" +
                "• Great for lightening the mood\n" +
                "• Rick Astley would be proud 🕺"
            )
        ),
        
        React.createElement(FormRow, {
            label: "Warning",
            trailing: FormRow.Arrow
        },
            React.createElement(FormText, { style: { color: '#ff6b6b' } },
                "Use responsibly! Don't spam rickrolls or your friends might get annoyed. " +
                "Remember: with great power comes great ricksponsibility! 🎵"
            )
        )
    );
}
