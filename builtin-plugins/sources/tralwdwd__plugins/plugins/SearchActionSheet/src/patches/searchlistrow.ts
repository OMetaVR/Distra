import { after, before, Cleanup } from "@lib/patcher";
import { findByProps, findByStoreName } from "@vendetta/metro";

const SearchListRow = findByProps("SearchListRow").SearchListRow;
const LongPressMessageActions = findByProps("showLongPressMessageActionSheet");
const UserStore = findByStoreName("UserStore");

export function patchSearchListRow(cleanup: Cleanup) {
    cleanup(
        after("type", SearchListRow, ([props], ret) => {
            if (typeof props.label === "string") return;

            // extract data from label props
            const { message, channel } = props.label.props;
            const user = UserStore.getUser(message.author.id);

            const actionSheetConfig = {
                canAddNewReactions: true,
                channel,
                message,
                user,
            };

            ret.props.onLongPress = () => {
                LongPressMessageActions.showLongPressMessageActionSheet(
                    actionSheetConfig,
                );
            };
        }),
    );
}

export function patchMessageActionSheet(cleanup: Cleanup) {
    cleanup(
        before(
            "showLongPressMessageActionSheet",
            LongPressMessageActions,
            ([config]) => {
                if (config.actionSheetSource === "Preview") {
                    config.actionSheetSource = null;
                    config.canAddNewReactions = true;
                }
            },
        ),
    );
}
