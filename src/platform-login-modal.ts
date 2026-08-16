import { App, Modal, Notice } from "obsidian";
import type { BrowserCaptureSessionCookie, SavedDomainSession } from "./types";

export interface PlatformAuthConfig {
  name: string;
  domain: string;
  loginUrl: string;
  authCookies: string[];
  userAgent?: string;
}

export const PLATFORM_AUTH_CONFIGS: Record<string, PlatformAuthConfig> = {
  "xiaohongshu.com": {
    name: "小红书",
    domain: "xiaohongshu.com",
    loginUrl: "https://www.xiaohongshu.com/login",
    authCookies: ["web_session", "a1", "webId", "web_session_id", "web_session_tag"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "douyin.com": {
    name: "抖音",
    domain: "douyin.com",
    loginUrl: "https://www.douyin.com",
    authCookies: ["sessionid", "passport_csrf_token", "odin_tt", "sessionid_ss"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "tiktok.com": {
    name: "TikTok",
    domain: "tiktok.com",
    loginUrl: "https://www.tiktok.com/login",
    authCookies: ["sessionid", "sid_guard", "uid_tt", "sessionid_ss"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "bilibili.com": {
    name: "哔哩哔哩",
    domain: "bilibili.com",
    loginUrl: "https://passport.bilibili.com/login",
    authCookies: ["SESSDATA", "bili_jct", "DedeUserID"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "ixigua.com": {
    name: "西瓜视频",
    domain: "ixigua.com",
    loginUrl: "https://www.ixigua.com",
    authCookies: ["sessionid", "passport_csrf_token", "odin_tt"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "qq.com": {
    name: "腾讯视频",
    domain: "qq.com",
    loginUrl: "https://v.qq.com",
    authCookies: ["vqq_vuserid", "vqq_vuservalue", "vqq_access_token", "vqq_openid", "main_login"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "instagram.com": {
    name: "Instagram",
    domain: "instagram.com",
    loginUrl: "https://www.instagram.com/accounts/login/",
    authCookies: ["sessionid", "ds_user_id", "mid"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "vimeo.com": {
    name: "Vimeo",
    domain: "vimeo.com",
    loginUrl: "https://vimeo.com/log_in",
    authCookies: ["vimeo", "continuous_play_v3"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
  "youtube.com": {
    name: "YouTube",
    domain: "youtube.com",
    loginUrl: "https://accounts.google.com/ServiceLogin?service=youtube",
    authCookies: ["LOGIN_INFO", "SAPISID", "SSID", "HSID", "SID"],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

type WebviewLike = HTMLElement & {
  src: string;
  partition?: string;
  useragent?: string;
  getWebContents?: () => {
    session?: {
      cookies?: {
        get: (filter: { domain?: string }) => Promise<Array<{
          name: string;
          value: string;
          domain?: string;
          path?: string;
          secure?: boolean;
          httpOnly?: boolean;
          expirationDate?: number;
        }>>;
      };
    };
  };
  executeJavaScript?: (code: string) => Promise<unknown>;
};

export class PlatformLoginModal extends Modal {
  private webviewEl: WebviewLike | null = null;
  private checkTimer: number | null = null;
  private isResolved = false;

  constructor(
    app: App,
    private readonly platform: PlatformAuthConfig,
    private readonly onAuthSuccess: (session: SavedDomainSession) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("knowgrove-platform-login-modal");

    contentEl.createEl("h2", { text: `登录 ${this.platform.name} 完成授权` });
    contentEl.createEl("p", {
      text: "请在下方窗口中完成一次扫码或账号登录。登录成功后，KnowGrove 会自动捕获授权凭据、持久化保存并继续解析内容（后续任务完全自动化，无需重复登录）。",
      cls: "setting-item-description knowgrove-platform-login-desc",
    });

    const webview = contentEl.createEl("webview" as keyof HTMLElementTagNameMap, {
      cls: "knowgrove-platform-login-webview",
      attr: {
        src: this.platform.loginUrl,
        partition: "persist:knowgrove",
        ...(this.platform.userAgent ? { useragent: this.platform.userAgent } : {}),
      },
    }) as unknown as WebviewLike;

    this.webviewEl = webview;

    const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });
    const confirmBtn = buttonContainer.createEl("button", { text: "我已完成登录", cls: "mod-cta" });
    confirmBtn.addEventListener("click", () => {
      void this.checkAndResolveCookies(true);
    });

    const cancelBtn = buttonContainer.createEl("button", { text: "取消" });
    cancelBtn.addEventListener("click", () => this.close());

    // Start polling for login cookies
    this.startCookiePolling();
  }

  private startCookiePolling(): void {
    const poll = async (): Promise<void> => {
      if (this.isResolved) return;
      await this.checkAndResolveCookies(false);
      if (!this.isResolved) {
        this.checkTimer = window.setTimeout(() => void poll(), 1500);
      }
    };
    this.checkTimer = window.setTimeout(() => void poll(), 2000);
  }

  private async extractCookiesFromWebview(): Promise<BrowserCaptureSessionCookie[]> {
    if (!this.webviewEl) return [];
    try {
      // Method 1: Electron session cookies
      const wc = this.webviewEl.getWebContents?.();
      if (wc?.session?.cookies) {
        const electronCookies = await wc.session.cookies.get({ domain: this.platform.domain });
        if (electronCookies && electronCookies.length > 0) {
          return electronCookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain || `.${this.platform.domain}`,
            path: c.path || "/",
            secure: Boolean(c.secure),
            httpOnly: Boolean(c.httpOnly),
            expirationDate: c.expirationDate,
          }));
        }
      }
    } catch {
      // Fallback
    }

    try {
      // Method 2: executeJavaScript document.cookie
      if (this.webviewEl.executeJavaScript) {
        const raw = await this.webviewEl.executeJavaScript("document.cookie");
        if (typeof raw === "string" && raw.trim()) {
          const pairs = raw.split(";");
          const cookies: BrowserCaptureSessionCookie[] = [];
          for (const pair of pairs) {
            const trimmed = pair.trim();
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx <= 0) continue;
            const name = trimmed.slice(0, eqIdx).trim();
            const value = trimmed.slice(eqIdx + 1).trim();
            if (name && value) {
              cookies.push({
                name,
                value,
                domain: `.${this.platform.domain}`,
                path: "/",
                secure: true,
              });
            }
          }
          return cookies;
        }
      }
    } catch {
      // Ignore
    }

    return [];
  }

  private async checkAndResolveCookies(isManualTrigger: boolean): Promise<void> {
    if (this.isResolved) return;
    const cookies = await this.extractCookiesFromWebview();
    if (!cookies.length) {
      if (isManualTrigger) {
        new Notice("未能检测到有效的登录会话，请在上方页面中完成登录后重试", 5000);
      }
      return;
    }

    // Check if any key auth cookie matches
    const hasAuthCookie = this.platform.authCookies.some((key) =>
      cookies.some((c) => c.name.toLowerCase() === key.toLowerCase() && c.value.length > 0),
    );

    if (hasAuthCookie || (isManualTrigger && cookies.length >= 2)) {
      this.isResolved = true;
      if (this.checkTimer !== null) {
        window.clearTimeout(this.checkTimer);
        this.checkTimer = null;
      }
      const session: SavedDomainSession = {
        domain: this.platform.domain,
        cookies,
        userAgent: this.platform.userAgent,
        referer: `https://www.${this.platform.domain}/`,
        updatedAt: Date.now(),
      };
      this.onAuthSuccess(session);
      new Notice(`已成功完成 ${this.platform.name} 登录授权，正在继续解析...`, 5000);
      this.close();
    }
  }

  onClose(): void {
    this.isResolved = true;
    if (this.checkTimer !== null) {
      window.clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
    this.contentEl.empty();
  }
}
