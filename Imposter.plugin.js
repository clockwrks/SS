

declare namespace BdApi {
  // Persistent storage
  const Data: {
    load(pluginName: string, key: string): any;
    save(pluginName: string, key: string, value: any): void;
    delete?(pluginName: string, key: string): void;
  };

  // Patcher API
  const Patcher: {
    after(
      id: string,
      target: any,
      method: string,
      callback: (thisObj: any, args: any[], returnValue: any) => any
    ): void;
    unpatchAll(id: string): void;
  };

  // React export
  const React: any;

  // UI helpers
  const UI: {
    showToast(message: string, options?: { type?: 'info' | 'error' | 'success'; timeout?: number }): void;
    buildSettingsPanel(options: { settings: any[]; onChange: () => void }): HTMLElement;
  };

  // Webpack store lookup
  const Webpack: {
    getStore(storeName: string): any;
  };

  // Dispatcher
  const Dispatcher: {
    subscribe(event: string, fn: (...args: any[]) => void): void;
    unsubscribe(event: string, fn: (...args: any[]) => void): void;
    dispatch?(payload: { type: string; [key: string]: any }): void;
  };
}

interface Settings {
  active: boolean;
  subjectUserId: string;
  targetUserId: string;
}

interface ConfigOption {
  type: string;
  id: keyof Settings;
  name: string;
  note: string;
  value: boolean | string;
  placeholder?: string;
  onChange: (val: any) => void;
}

interface Config {
  settings: ConfigOption[];
}

export default class Imposter {
  private UserStore: any;
  private UserProfileStore: any;
  private PresenceStore: any;
  private GuildMemberStore: any;
  private defaultSettings: Settings = { active: true, subjectUserId: '', targetUserId: '' };
  private settings: Settings;
  private config: Config;

  constructor(meta?: any) {
    this.UserStore = BdApi.Webpack.getStore('UserStore');
    this.UserProfileStore = BdApi.Webpack.getStore('UserProfileStore');
    this.PresenceStore = BdApi.Webpack.getStore('PresenceStore');
    this.GuildMemberStore = BdApi.Webpack.getStore('GuildMemberStore');
    this.settings = this.loadSettings();
    this.config = {
      settings: [
        {
          type: 'switch',
          id: 'active',
          name: 'Enabled',
          note: 'The plugin is active or not',
          value: this.settings.active,
          onChange: (val: boolean) => {
            this.settings.active = val;
            this.saveSettings();
          },
        },
        {
          type: 'text',
          id: 'subjectUserId',
          name: 'Subject User ID',
          note: 'The user to copy the identity from.',
          value: this.settings.subjectUserId,
          placeholder: 'User ID',
          onChange: (val: string) => {
            this.settings.subjectUserId = val;
            this.saveSettings();
          },
        },
        {
          type: 'text',
          id: 'targetUserId',
          name: 'Target User ID',
          note: 'The user to copy the identity to.',
          value: this.settings.targetUserId,
          placeholder: 'User ID',
          onChange: (val: string) => {
            this.settings.targetUserId = val;
            this.saveSettings();
          },
        },
      ],
    };
  }

  start(): void {
    this.loadPatches();
    BdApi.Dispatcher.subscribe('MESSAGE_CREATE', this.handleSendMessage as any);
  }

  private loadPatches(): void {
    BdApi.Patcher.after('spoof-user', this.UserStore, 'getUser', (that: any, args: any[], res: any) => {
      if (res?.id === this.settings.targetUserId) {
        const subjectUser = this.UserStore.getUser(this.settings.subjectUserId);
        return {
          username: subjectUser.username,
          avatar: subjectUser.avatar,
          banner: subjectUser.banner,
          avatarDecorationData: subjectUser.avatarDecorationData,
          id: subjectUser.id,
          globalName: subjectUser.globalName,
          createdAt: subjectUser.createdAt,
          __proto__: res,
        };
      }
    });

    BdApi.Patcher.after('spoof-user-profile', this.UserProfileStore, 'getUserProfile', (that: any, args: any[], res: any) => {
      if (res?.userId === this.settings.targetUserId) {
        const subjectUser = this.UserProfileStore.getUserProfile(this.settings.subjectUserId);
        return {
          badges: subjectUser.badges,
          bio: subjectUser.bio,
          profileEffectId: subjectUser.profileEffectId,
          pronouns: subjectUser.pronouns,
          themeColor: subjectUser.themeColor,
          __proto__: res,
        };
      }
    });

    BdApi.Patcher.after('spoof-user-mutual-guilds', this.UserProfileStore, 'getMutualGuilds', (that: any, args: any[], res: any) => {
      if (args?.[0] === this.settings.targetUserId) {
        const data = this.UserProfileStore.getMutualGuilds(this.settings.subjectUserId);
        if (data) return data;
      }
    });

    BdApi.Patcher.after('spoof-user-status', this.PresenceStore, 'getPrimaryActivity', (that: any, args: any[], res: any) => {
      if (args?.[0] === this.settings.targetUserId) {
        const data = this.PresenceStore.getPrimaryActivity(this.settings.subjectUserId);
        if (data) return data;
      }
    });

    BdApi.Patcher.after('spoof-user-guild-profile', this.GuildMemberStore, 'getMember', (that: any, args: any[], res: any) => {
      if (args?.[1] === this.settings.targetUserId) {
        const subjectUser = this.UserStore.getUser(this.settings.subjectUserId);
        const subjectMember = this.GuildMemberStore.getMember(args[0], this.settings.subjectUserId);
        if (subjectUser) {
          return {
            nick: subjectMember ? subjectMember.nick : subjectUser.globalName,
            __proto__: res,
          };
        }
      }
    });
  }

  private loadSettings(): Settings {
    try {
      const saved = BdApi.Data.load('Imposter', 'settings') as Partial<Settings> | null;
      return { ...this.defaultSettings, ...(saved ?? {}) };
    } catch {
      BdApi.UI.showToast('Failed to load settings', { type: 'error' });
      return this.defaultSettings;
    }
  }

  private saveSettings(): void {
    try {
      BdApi.Data.save('Imposter', 'settings', this.settings);
      if (!this.settings.active) {
        ['spoof-user','spoof-user-profile','spoof-user-mutual-guilds','spoof-user-status','spoof-user-guild-profile']
          .forEach(id => BdApi.Patcher.unpatchAll(id));
      } else {
        this.loadPatches();
      }
    } catch {
      BdApi.UI.showToast('Failed to save settings', { type: 'error' });
    }
  }

  stop(): void {
    ['spoof-user','spoof-user-profile','spoof-user-mutual-guilds','spoof-user-status','spoof-user-guild-profile']
      .forEach(id => BdApi.Patcher.unpatchAll(id));
  }

  getSettingsPanel(): HTMLElement {
    return BdApi.UI.buildSettingsPanel({ settings: this.config.settings, onChange: () => {} });
  }

  private handleSendMessage(...args: any[]): void {
    // placeholder
  }
}
