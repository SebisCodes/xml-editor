/**
 * The example document (shown on the first visit and by "New") and the templates offered
 * by "New". The shared convert test imports START by this name.
 */

export const START = {
    name: 'Welcome',
    code: `<?xml version="1.0" encoding="UTF-8"?>
<!-- Click a value in the tree to edit it right there. -->
<library xmlns:dc="http://purl.org/dc/elements/1.1/" city="Zürich">
  <book id="b1" available="true">
    <dc:title>The Pragmatic Programmer</dc:title>
    <dc:creator>Andrew Hunt</dc:creator>
    <dc:creator>David Thomas</dc:creator>
    <year>1999</year>
    <price currency="CHF">42.50</price>
  </book>
  <book id="b2" available="false">
    <dc:title>Gödel, Escher, Bach</dc:title>
    <dc:creator>Douglas R. Hofstadter</dc:creator>
    <year>1979</year>
    <price currency="CHF">29.90</price>
    <note><![CDATA[Back in stock soon - price < 30 & signed]]></note>
  </book>
  <?shelf row="3"?>
</library>
`,
};

export const TEMPLATES = {
    catalog: {
        name: 'Product catalog',
        code: `<?xml version="1.0" encoding="UTF-8"?>
<catalog updated="2026-01-01">
  <product sku="A-100">
    <name>Desk lamp</name>
    <price currency="CHF">49.00</price>
    <stock>12</stock>
  </product>
  <product sku="A-200">
    <name>Office chair</name>
    <price currency="CHF">189.00</price>
    <stock>3</stock>
  </product>
</catalog>
`,
    },
    rss: {
        name: 'RSS feed',
        code: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>My News</title>
    <link>https://example.com/</link>
    <description>What is new on example.com</description>
    <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
    <item>
      <title>First post</title>
      <link>https://example.com/first</link>
      <pubDate>Thu, 01 Jan 2026 09:00:00 +0100</pubDate>
      <description>A short summary of the first post.</description>
    </item>
  </channel>
</rss>
`,
    },
    sitemap: {
        name: 'Sitemap',
        code: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://example.com/about.html</loc>
    <priority>0.5</priority>
  </url>
</urlset>
`,
    },
    config: {
        name: 'Configuration',
        code: `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <appSettings>
    <add key="Title" value="My App"/>
    <add key="Language" value="en"/>
  </appSettings>
  <database host="localhost" port="5432">
    <name>app</name>
    <user>app</user>
  </database>
</configuration>
`,
    },
};
