import { storage } from './storage';
import type { Article } from '@shared/schema';

export class RssGenerator {
  private baseUrl: string;

  constructor() {
    // Use the Replit domain if available, otherwise fall back to localhost
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      const domains = replitDomains.split(',');
      this.baseUrl = `https://${domains[0]}`;
    } else {
      this.baseUrl = 'http://localhost:5000';
    }
  }

  async generateRssFeed(): Promise<string> {
    try {
      const articles = await storage.getArticles(50); // Get latest 50 articles
      
      const rssItems = articles.map(article => this.createRssItem(article)).join('\n    ');
      
      const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>UNIK Kediri News Feed</title>
    <link>https://unik-kediri.ac.id/list-berita</link>
    <description>Latest news from Universitas Kadiri (UNIK) - Auto-generated RSS feed</description>
    <language>id-ID</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>UNIK RSS Feed Generator</generator>
    <managingEditor>webmaster@unik-kediri.ac.id</managingEditor>
    <webMaster>webmaster@unik-kediri.ac.id</webMaster>
    <ttl>60</ttl>
    <image>
      <url>https://unik-kediri.ac.id/favicon.ico</url>
      <title>UNIK Kediri</title>
      <link>https://unik-kediri.ac.id</link>
      <width>32</width>
      <height>32</height>
    </image>
    ${rssItems}
  </channel>
</rss>`;

      await storage.createLog({
        level: 'info',
        message: 'RSS feed generated successfully'
      });

      return rssFeed;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await storage.createLog({
        level: 'error',
        message: `RSS generation failed: ${errorMessage}`
      });
      throw error;
    }
  }

  private createRssItem(article: Article): string {
    const pubDate = new Date(article.scrapedAt).toUTCString();
    const guid = this.generateGuid(article.url);
    
    // Clean and escape content for XML
    const title = this.escapeXml(article.title);
    const description = this.escapeXml(article.excerpt || 'No description available');
    const link = this.escapeXml(article.url);
    const category = this.escapeXml(article.category || 'Umum');

    return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <description>${description}</description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${link}</guid>
      <category>${category}</category>
      <dc:creator>UNIK Kediri</dc:creator>
      <content:encoded><![CDATA[
        <div>
          <h3>${title}</h3>
          <p>${description}</p>
          <p><strong>Kategori:</strong> ${category}</p>
          <p><a href="${link}" target="_blank">Baca selengkapnya di situs UNIK Kediri</a></p>
        </div>
      ]]></content:encoded>
    </item>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private generateGuid(url: string): string {
    // Use URL as GUID, ensuring it's a valid permalink
    return url;
  }
}

export const rssGenerator = new RssGenerator();
