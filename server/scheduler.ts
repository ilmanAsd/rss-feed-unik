import * as cron from 'node-cron';
import { scraper } from './scraper';
import { storage } from './storage';

export class TaskScheduler {
  private isRunning: boolean = false;
  private currentTask: cron.ScheduledTask | null = null;

  async start(): Promise<void> {
    await storage.createLog({
      level: 'info',
      message: 'RSS Feed Scheduler starting...'
    });

    // Run initial scrape
    await this.runScrapeTask();

    // Set up scheduled task
    await this.scheduleTask();

    await storage.createLog({
      level: 'success',
      message: 'RSS Feed Scheduler started successfully'
    });
  }

  async scheduleTask(): Promise<void> {
    // Stop existing task if running
    if (this.currentTask) {
      this.currentTask.stop();
    }

    const intervalSetting = await storage.getSetting('updateInterval');
    const intervalMinutes = intervalSetting ? parseInt(intervalSetting.value) : 15;

    // Create cron expression for the interval
    const cronExpression = `*/${intervalMinutes} * * * *`;

    this.currentTask = cron.schedule(cronExpression, async () => {
      await this.runScrapeTask();
    }, {
      scheduled: true,
      timezone: "Asia/Jakarta"
    });

    await storage.createLog({
      level: 'info',
      message: `Scheduled scraping every ${intervalMinutes} minutes`
    });
  }

  async runScrapeTask(): Promise<void> {
    if (this.isRunning) {
      await storage.createLog({
        level: 'warn',
        message: 'Scrape task already running, skipping...'
      });
      return;
    }

    this.isRunning = true;

    try {
      await storage.createLog({
        level: 'info',
        message: 'Starting news scraping task...'
      });

      const articles = await scraper.scrapeNews();
      await scraper.saveArticles(articles);

      await storage.createLog({
        level: 'success',
        message: `Scraping completed successfully. Found ${articles.length} articles`
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await storage.createLog({
        level: 'error',
        message: `Scraping task failed: ${errorMessage}`
      });
    } finally {
      this.isRunning = false;
    }
  }

  async updateSchedule(): Promise<void> {
    await this.scheduleTask();
  }

  stop(): void {
    if (this.currentTask) {
      this.currentTask.stop();
      this.currentTask = null;
    }
  }
}

export const scheduler = new TaskScheduler();
