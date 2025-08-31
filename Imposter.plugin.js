/**
 * @name Imposter
 * @author eeriemyxi
 * @authorId 598134630104825856
 * @description Impersonate someone as somebody.
 * @website https://github.com/eeriemyxi
 * @version 0.0.1
 */

const {Data, Patcher, React, UI, Webpack} = BdApi;

module.exports = class Imposter {
    constructor(meta) {
        this.UserStore = Webpack.getStore("UserStore")
        this.UserProfileStore = Webpack.getStore("UserProfileStore")
        this.PresenceStore = Webpack.getStore("PresenceStore")
        this.GuildMemberStore = Webpack.getStore("GuildMemberStore")

        this.defaultSettings = {"active": true, "subjectUserId": "", "targetUserID":""}
        this.settings = this.loadSettings();

        this.config = {
            settings: [
                {
                    type: "switch",
                    id: "active",
                    name: "Enabled",
                    note: "The plugin is active or not",
                    value: !!this.settings.active,
                    onChange: (val) => {
                        this.settings.active = val,
                        this.saveSettings()
                    }
                },
                {
                    type: "text",
                    id: "subjectUserId",
                    name: "Subject User ID",
                    note: "The user to copy the identify from.",
                    value: this.settings.subjectUserId,
                    placeholder: "User ID",
                    onChange: (val) => {
                        this.settings.subjectUserId = val
                        this.saveSettings()
                    }
                },
                {
                    type: "text",
                    id: "targetUserId",
                    name: "Target User ID",
                    note: "The user to copy the identity to.",
                    value: this.settings.targetUserId,
                    placeholder: "User ID",
                    onChange: (val) => {
                        this.settings.targetUserId = val
                        this.saveSettings()
                    }
               }
            ]
        };
    }

    start() {
        this.Dispatcher?.subscribe("MESSAGE_CREATE", this.handleSendMessage);

        this.loadPatches()
    }

    loadPatches() {
        Patcher.after("spoof-user", this.UserStore, "getUser", (that, args, res) => {
            if (res && res.id === this.settings.targetUserId) {
                const subjectUser = this.UserStore.getUser(this.settings.subjectUserId)
                return {
                    username: subjectUser.username,
                    avatar: subjectUser.avatar,
                    banner: subjectUser.banner,
                    avatarDecorationData: subjectUser.avatarDecorationData,
                    id: subjectUser.id,
                    globalName: subjectUser.globalName,
                    createdAt: subjectUser.createdAt,
                    __proto__: res
                }
            }
        });

        Patcher.after("spoof-user-profile", this.UserProfileStore, "getUserProfile", (that, args, res) => {
            if (res && res.userId === this.settings.targetUserId) {
                const subjectUser = this.UserProfileStore.getUserProfile(this.settings.subjectUserId)
                return {
                    badges: subjectUser.badges,
                    bio: subjectUser.bio,
                    profileEffectId: subjectUser.profileEffectId,
                    pronouns: subjectUser.pronouns,
                    themeColor: subjectUser.themeColor,
                    __proto__: res
                }
            }
        });

        Patcher.after("spoof-user-mutual-guilds", this.UserProfileStore, "getMutualGuilds", (that, args, res) => {
            if (args && args[0] === this.settings.targetUserId) {
                const data = this.UserProfileStore.getMutualGuilds(this.settings.subjectUserId);
                if (data) {
                    return data
                };
            }
        });

        Patcher.after("spoof-user-status", this.PresenceStore, "getPrimaryActivity", (that, args, res) => {
            if (args && args[0] === this.settings.targetUserId) {
                const data = this.PresenceStore.getPrimaryActivity(this.settings.subjectUserId);
                if (data) {
                    return data
                };
            }
        });

        Patcher.after("spoof-user-guild-profile", this.GuildMemberStore, "getMember", (that, args, res) => {
            if (args && args[1] === this.settings.targetUserId) {
                const subjectUser = this.UserStore.getUser(this.settings.subjectUserId)
                const subjectMember = this.GuildMemberStore.getMember(args[0], this.settings.subjectUserId)
                if (subjectUser) {
                    return {
                        nick: subjectMember ? subjectMember["nick"] : subjectUser["globalName"],
                        __proto__: res
                    }
                };
            }
        });
    }

    loadSettings() {
        try {
            const saved = Data.load("Imposter", "settings") || {};
            return Object.assign({}, this.defaultSettings, saved);
        } catch (err) {
            UI.showToast("Failed to load settings", { type: "error" });
            return this.defaultSettings;
        }
    }

    saveSettings() {
        try {
            console.log(this.settings)
            Data.save("Imposter", "settings", this.settings);
            if (!this.settings.active) {
                Patcher.unpatchAll("spoof-user")
                Patcher.unpatchAll("spoof-user-profile")
                Patcher.unpatchAll("spoof-user-mutual-guilds")
                Patcher.unpatchAll("spoof-user-status")
                Patcher.unpatchAll("spoof-user-guild-profile")
            } else {
                this.loadPatches()
            }
        } catch (err) {
            UI.showToast("Failed to save settings", { type: "error" });
        }
    }

    stop() {}

    getSettingsPanel() {
        return BdApi.UI.buildSettingsPanel({
            settings: this.config.settings, onChange: (category, id, name, value) => {}
        });
    }
}
