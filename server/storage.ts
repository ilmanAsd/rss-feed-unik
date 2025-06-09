import { 
  articles, 
  systemLogs, 
  settings,
  type Article, 
  type InsertArticle,
  type SystemLog,
  type InsertLog,
  type Setting,
  type InsertSetting,
  type RssStatus,
  type ServerInfo
} from "@shared/schema";

export interface IStorage {
  // Articles
  getArticles(limit?: number): Promise<Article[]>;
  getArticleByUrl(url: string): Promise<Article | undefined>;
  createArticle(article: InsertArticle): Promise<Article>;
  deleteOldArticles(keepCount: number): Promise<void>;
  
  // System Logs
  getLogs(limit?: number): Promise<SystemLog[]>;
  createLog(log: InsertLog): Promise<SystemLog>;
  clearOldLogs(keepCount: number): Promise<void>;
  
  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(key: string, value: string): Promise<Setting>;
  getAllSettings(): Promise<Setting[]>;
  
  // Status and Stats
  getRssStatus(): Promise<RssStatus>;
  getServerInfo(): Promise<ServerInfo>;
}

export class MemStorage implements IStorage {
  private articles: Map<number, Article>;
  private logs: Map<number, SystemLog>;
  private settings: Map<string, Setting>;
  private currentArticleId: number;
  private currentLogId: number;
  private currentSettingId: number;
  private startTime: number;

  constructor() {
    this.articles = new Map();
    this.logs = new Map();
    this.settings = new Map();
    this.currentArticleId = 1;
    this.currentLogId = 1;
    this.currentSettingId = 1;
    this.startTime = Date.now();
    
    // Initialize default settings
    this.initializeDefaultSettings();
  }

  private async initializeDefaultSettings() {
    await this.setSetting('updateInterval', '15');
    await this.setSetting('maxArticles', '20');
    await this.setSetting('sourceUrl', 'https://unik-kediri.ac.id/list-berita');
  }

  async getArticles(limit: number = 50): Promise<Article[]> {
    const articles = Array.from(this.articles.values())
      .sort((a, b) => new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime())
      .slice(0, limit);
    return articles;
  }

  async getArticleByUrl(url: string): Promise<Article | undefined> {
    return Array.from(this.articles.values()).find(article => article.url === url);
  }

  async createArticle(insertArticle: InsertArticle): Promise<Article> {
    const id = this.currentArticleId++;
    const article: Article = {
      ...insertArticle,
      id,
      scrapedAt: new Date(),
    };
    this.articles.set(id, article);
    return article;
  }

  async deleteOldArticles(keepCount: number): Promise<void> {
    const articles = await this.getArticles();
    if (articles.length > keepCount) {
      const toDelete = articles.slice(keepCount);
      toDelete.forEach(article => {
        this.articles.delete(article.id);
      });
    }
  }

  async getLogs(limit: number = 100): Promise<SystemLog[]> {
    const logs = Array.from(this.logs.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
    return logs;
  }

  async createLog(insertLog: InsertLog): Promise<SystemLog> {
    const id = this.currentLogId++;
    const log: SystemLog = {
      ...insertLog,
      id,
      timestamp: new Date(),
    };
    this.logs.set(id, log);
    return log;
  }

  async clearOldLogs(keepCount: number): Promise<void> {
    const logs = await this.getLogs();
    if (logs.length > keepCount) {
      const toDelete = logs.slice(keepCount);
      toDelete.forEach(log => {
        this.logs.delete(log.id);
      });
    }
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settings.get(key);
  }

  async setSetting(key: string, value: string): Promise<Setting> {
    const existing = this.settings.get(key);
    if (existing) {
      const updated: Setting = {
        ...existing,
        value,
        updatedAt: new Date(),
      };
      this.settings.set(key, updated);
      return updated;
    } else {
      const id = this.currentSettingId++;
      const setting: Setting = {
        id,
        key,
        value,
        updatedAt: new Date(),
      };
      this.settings.set(key, setting);
      return setting;
    }
  }

  async getAllSettings(): Promise<Setting[]> {
    return Array.from(this.settings.values());
  }

  async getRssStatus(): Promise<RssStatus> {
    const articles = await this.getArticles();
    const logs = await this.getLogs(10);
    
    const errorLogs = logs.filter(log => log.level === 'error');
    const successLogs = logs.filter(log => log.level === 'success' || log.level === 'info');
    const successRate = logs.length > 0 ? (successLogs.length / logs.length) * 100 : 100;
    
    const lastUpdate = articles.length > 0 
      ? this.formatRelativeTime(new Date(articles[0].scrapedAt))
      : 'Never';

    return {
      status: errorLogs.length > successLogs.length ? 'error' : 'active',
      lastUpdate,
      articleCount: articles.length,
      successRate: Math.round(successRate * 10) / 10,
      isScrapingActive: true,
    };
  }

  async getServerInfo(): Promise<ServerInfo> {
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    const uptimeMs = Date.now() - this.startTime;
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      nodeVersion: process.version,
      memoryUsage: `${memoryMB} MB`,
      uptime: `${uptimeHours}h ${uptimeMinutes}m`,
    };
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMinutes % 60}m ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }
}

export const storage = new MemStorage();
