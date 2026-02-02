import * as vscode from "vscode";

export const translations: Record<string, Record<string, string>> = {
  tr: {
    "extension.name": "Auto Accept Ego",
    "extension.status.on": "EGO: AKTİF",
    "extension.status.off": "EGO: DEVRE DIŞI",
    "dashboard.title": "Ego Kontrol Paneli",
    "dashboard.stats.accepted": "Kabul Edilen",
    "dashboard.stats.blocked": "Engellenen",
    "dashboard.stats.skipped": "Atlanan",
    "dashboard.stats.agents": "Aktif Ajanlar",
    "dashboard.tabs.stats": "İstatistikler",
    "dashboard.tabs.categories": "Kategoriler",
    "dashboard.tabs.security": "Güvenlik",
    "dashboard.tabs.logs": "Loglar",
    "dashboard.settings.general": "Genel Ayarlar",
    "dashboard.settings.language": "Dil",
    "dashboard.settings.threatAction": "Tehlike Anında",
    "dashboard.settings.safeMode": "Güvenli Mod",
    "dashboard.settings.threshold": "Tehlike Eşiği",
    "dashboard.settings.whitelist": "Güvenli Liste",
    "dashboard.settings.blacklist": "Kara Liste",
    "dashboard.settings.save": "Kaydet",
    "dashboard.settings.clearLogs": "Logları Temizle",
    "dashboard.categories.files": "Dosya Düzenlemeleri",
    "dashboard.categories.terminal": "Terminal Komutları",
    "dashboard.categories.dialogs": "Onay Diyalogları",
    "dashboard.categories.git": "Git İşlemleri",
    "dashboard.categories.package": "Paket Yönetimi",
    "security.blocked.title": "Tehlikeli Komut Engellendi!",
    "security.blocked.reason": "Sebep",
    "security.blocked.viewDetails": "Detayları Gör",
    "security.blocked.runAnyway": "Yine de Çalıştır",
    "dashboard.tabs.quota": "Kota",
    "quota.title": "AI Model Kotaları",
    "quota.refresh": "Yenile",
    "quota.refreshing": "Yenileniyor...",
    "quota.resetsIn": "Yenilenir",
    "quota.loading": "Yükleniyor...",
    "quota.error.processNotFound": "Antigravity process bulunamadı",
    "quota.error.fetchFailed": "Kota bilgisi alınamadı",
    "dashboard.stats.reset": "İstatistikleri Sıfırla",
    "dashboard.stats.resetSuccess": "İstatistikler sıfırlandı.",
  },
  en: {
    "extension.name": "Auto Accept Ego",
    "extension.status.on": "EGO: ACTIVE",
    "extension.status.off": "EGO: DISABLED",
    "dashboard.title": "Ego Dashboard",
    "dashboard.stats.accepted": "Accepted",
    "dashboard.stats.blocked": "Blocked",
    "dashboard.stats.skipped": "Skipped",
    "dashboard.stats.agents": "Active Agents",
    "dashboard.tabs.stats": "Statistics",
    "dashboard.tabs.categories": "Categories",
    "dashboard.tabs.security": "Security",
    "dashboard.tabs.logs": "Logs",
    "dashboard.settings.general": "General Settings",
    "dashboard.settings.language": "Language",
    "dashboard.settings.threatAction": "On Threat",
    "dashboard.settings.safeMode": "Safe Mode",
    "dashboard.settings.threshold": "Danger Threshold",
    "dashboard.settings.whitelist": "Whitelist",
    "dashboard.settings.blacklist": "Blacklist",
    "dashboard.settings.save": "Save",
    "dashboard.settings.clearLogs": "Clear Logs",
    "dashboard.categories.files": "File Edits",
    "dashboard.categories.terminal": "Terminal Commands",
    "dashboard.categories.dialogs": "Confirmation Dialogs",
    "dashboard.categories.git": "Git Operations",
    "dashboard.categories.package": "Package Management",
    "security.blocked.title": "Dangerous Command Blocked!",
    "security.blocked.reason": "Reason",
    "security.blocked.viewDetails": "View Details",
    "security.blocked.runAnyway": "Run Anyway",
    "dashboard.tabs.quota": "Quota",
    "quota.title": "AI Model Quotas",
    "quota.refresh": "Refresh",
    "quota.refreshing": "Refreshing...",
    "quota.resetsIn": "Resets in",
    "quota.loading": "Loading...",
    "quota.error.processNotFound": "Antigravity process not found",
    "quota.error.fetchFailed": "Failed to fetch quota",
    "dashboard.stats.reset": "Reset Statistics",
    "dashboard.stats.resetSuccess": "Statistics reset.",
  },
};

export class I18n {
  private static currentLang: "tr" | "en" = "en";

  public static init(): void {
    const config = vscode.workspace.getConfiguration("auto-accept-ego");
    this.currentLang = config.get<"tr" | "en">("language", "en");
  }

  public static t(key: string): string {
    return translations[this.currentLang]?.[key] || key;
  }

  public static getLang(): "tr" | "en" {
    return this.currentLang;
  }

  public static getTranslations(): Record<string, string> {
    return translations[this.currentLang];
  }
}
