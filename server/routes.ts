import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { rssGenerator } from "./rss-generator";
import { scheduler } from "./scheduler";
import { insertSettingSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Start the scheduler
  await scheduler.start();

  // RSS Feed endpoint
  app.get("/rss.xml", async (req, res) => {
    try {
      const rssFeed = await rssGenerator.generateRssFeed();
      res.set({
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      });
      res.send(rssFeed);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'RSS generation failed';
      res.status(500).json({ error: errorMessage });
    }
  });

  // API Routes
  app.get("/api/status", async (req, res) => {
    try {
      const status = await storage.getRssStatus();
      res.json(status);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get status';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/articles", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const articles = await storage.getArticles(limit);
      res.json(articles);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get articles';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/logs", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await storage.getLogs(limit);
      res.json(logs);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get logs';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/server-info", async (req, res) => {
    try {
      const serverInfo = await storage.getServerInfo();
      res.json(serverInfo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get server info';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await storage.getAllSettings();
      res.json(settings);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get settings';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const result = insertSettingSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: "Invalid setting data", details: result.error });
      }

      const { key, value } = result.data;
      const setting = await storage.setSetting(key, value);
      
      // If update interval changed, reschedule tasks
      if (key === 'updateInterval') {
        await scheduler.updateSchedule();
        await storage.createLog({
          level: 'info',
          message: `Update interval changed to ${value} minutes`
        });
      }

      res.json(setting);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update setting';
      res.status(500).json({ error: errorMessage });
    }
  });

  app.post("/api/refresh", async (req, res) => {
    try {
      await scheduler.runScrapeTask();
      res.json({ message: "Refresh initiated successfully" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh feed';
      res.status(500).json({ error: errorMessage });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      service: "RSS Feed Generator"
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
