import * as cheerio from 'cheerio';
import { storage } from './storage';
import type { InsertArticle } from '@shared/schema';

export class NewsScraper {
  private sourceUrl: string;

  constructor(sourceUrl: string = 'https://unik-kediri.ac.id/list-berita') {
    this.sourceUrl = sourceUrl;
  }

  async scrapeNews(): Promise<InsertArticle[]> {
    try {
      await storage.createLog({
        level: 'info',
        message: 'Starting scheduled scrape...'
      });

      const response = await fetch(this.sourceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const articles: InsertArticle[] = [];

      // Updated selectors based on the actual structure of UNIK Kediri website
      // This might need adjustment based on the actual HTML structure
      const articleSelectors = [
        '.news-item',
        '.article-item', 
        '.post-item',
        '.content-item',
        'article',
        '.card',
        '[class*="news"]',
        '[class*="article"]'
      ];

      let foundArticles = false;

      for (const selector of articleSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          foundArticles = true;
          
          elements.each((index, element) => {
            try {
              const $element = $(element);
              
              // Try multiple selectors for title
              const title = $element.find('h1, h2, h3, h4, .title, [class*="title"], [class*="headline"]').first().text().trim() ||
                           $element.find('a').first().text().trim();
              
              // Try multiple selectors for link
              const relativeUrl = $element.find('a').first().attr('href') || '';
              const url = relativeUrl.startsWith('http') 
                ? relativeUrl 
                : relativeUrl.startsWith('/') 
                  ? `https://unik-kediri.ac.id${relativeUrl}`
                  : `https://unik-kediri.ac.id/${relativeUrl}`;
              
              // Try multiple selectors for excerpt/description
              const excerpt = $element.find('.excerpt, .description, .summary, p').first().text().trim() ||
                             $element.text().replace(title, '').trim().substring(0, 200);
              
              // Try to extract date
              const dateText = $element.find('.date, .published, [class*="date"], time').first().text().trim();
              const publishedDate = this.parseDate(dateText) || new Date().toISOString().split('T')[0];
              
              // Try to extract category
              const category = $element.find('.category, .tag, [class*="category"]').first().text().trim() || 'Umum';

              if (title && url && title.length > 10) {
                articles.push({
                  title: title.substring(0, 500), // Limit title length
                  excerpt: excerpt.substring(0, 1000), // Limit excerpt length
                  url,
                  category,
                  publishedDate,
                });
              }
            } catch (error) {
              console.error('Error parsing article element:', error);
            }
          });
          
          break; // Stop trying other selectors if we found articles
        }
      }

      if (!foundArticles) {
        // Fallback: try to extract any links that might be news articles
        $('a[href*="/berita"], a[href*="/news"], a[href*="/artikel"]').each((index, element) => {
          try {
            const $element = $(element);
            const title = $element.text().trim();
            const relativeUrl = $element.attr('href') || '';
            const url = relativeUrl.startsWith('http') 
              ? relativeUrl 
              : `https://unik-kediri.ac.id${relativeUrl}`;

            if (title && title.length > 10) {
              articles.push({
                title: title.substring(0, 500),
                excerpt: 'No excerpt available',
                url,
                category: 'Berita',
                publishedDate: new Date().toISOString().split('T')[0],
              });
            }
          } catch (error) {
            console.error('Error parsing link element:', error);
          }
        });
      }

      if (articles.length === 0) {
        await storage.createLog({
          level: 'warn',
          message: 'No articles found - website structure may have changed'
        });
      }

      await storage.createLog({
        level: 'success',
        message: `Successfully scraped ${articles.length} articles`
      });

      return articles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      await storage.createLog({
        level: 'error',
        message: `Scraping failed: ${errorMessage}`
      });
      throw error;
    }
  }

  private parseDate(dateText: string): string | null {
    if (!dateText) return null;
    
    try {
      // Try to parse various date formats
      const date = new Date(dateText);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
      
      // Try Indonesian date format
      const indonesianMonths: { [key: string]: string } = {
        'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
        'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
        'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
      };
      
      const lowerText = dateText.toLowerCase();
      for (const [month, num] of Object.entries(indonesianMonths)) {
        if (lowerText.includes(month)) {
          const yearMatch = dateText.match(/\b(20\d{2})\b/);
          const dayMatch = dateText.match(/\b(\d{1,2})\b/);
          
          if (yearMatch && dayMatch) {
            const year = yearMatch[1];
            const day = dayMatch[1].padStart(2, '0');
            return `${year}-${num}-${day}`;
          }
        }
      }
    } catch (error) {
      console.error('Error parsing date:', error);
    }
    
    return null;
  }

  async saveArticles(articles: InsertArticle[]): Promise<void> {
    let newArticlesCount = 0;
    
    for (const article of articles) {
      const existing = await storage.getArticleByUrl(article.url);
      if (!existing) {
        await storage.createArticle(article);
        newArticlesCount++;
      }
    }

    if (newArticlesCount > 0) {
      await storage.createLog({
        level: 'info',
        message: `Added ${newArticlesCount} new articles to database`
      });

      // Clean up old articles to keep storage manageable
      const maxArticlesSetting = await storage.getSetting('maxArticles');
      const maxArticles = maxArticlesSetting ? parseInt(maxArticlesSetting.value) : 20;
      await storage.deleteOldArticles(maxArticles * 2); // Keep double the max for buffer
    }

    // Clean up old logs
    await storage.clearOldLogs(200);
  }
}

export const scraper = new NewsScraper();
