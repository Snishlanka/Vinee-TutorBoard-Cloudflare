# Search visibility

The canonical site is https://vinee-tutorboard.snishlanka.workers.dev/.
The home page has descriptive metadata, visible teaching content, a WebSite name declaration and SoftwareApplication structured data. robots.txt allows crawling and links to sitemap.xml. The published allowlist includes both indexing files. Keep the existing Google verification meta tag.

## After deployment

1. Open [Google Search Console](https://search.google.com/search-console) and add the URL-prefix property `https://vinee-tutorboard.snishlanka.workers.dev/`.
2. Verify using the HTML meta tag provided for your Google account. The repository already contains a verification token; it only works for the account/property that issued it. Replace it only if Search Console supplies a different token for the intended owner.
3. Submit `sitemap.xml` under Sitemaps.
4. Inspect the home URL and `/whiteboard.html`. Run **Test live URL**, check indexing eligibility and Google's selected canonical, then **Request indexing**.
5. Review Page indexing reports for exclusions, fetch errors or crawl blocks, and Performance reports for queries such as `Vinee TutorBoard`, `Vinee Tutor Board` and `tutor board`.

An unsuccessful public search is not proof of a specific indexing problem. Search Console is needed to diagnose Google's actual status. Requests can take days or weeks, and neither indexing nor ranking for a generic phrase is guaranteed. See Google's [recrawl guidance](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl) and [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).

## Ongoing work

- Share the real site link through teaching materials and relevant pages that you control.
- Publish useful, original teaching examples when available, with links from the home page.
- Keep visible content and structured data consistent with shipped features. Avoid invented reviews, ratings or keyword stuffing.
- If the public domain changes, update canonical URLs, social URLs, structured data, robots.txt, sitemap.xml and Search Console together.
