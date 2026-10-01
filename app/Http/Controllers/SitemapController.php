<?php

namespace App\Http\Controllers;

use Illuminate\Http\Response;

/**
 * What search engines may crawl. Only the public pages are listed: everything else needs an
 * account, and shared challenge and replay links are short-lived or personal.
 */
class SitemapController extends Controller
{
    private const PAGES = [
        ['route' => 'home', 'changefreq' => 'weekly', 'priority' => '1.0'],
        ['route' => 'practice', 'changefreq' => 'weekly', 'priority' => '0.8'],
        ['route' => 'about', 'changefreq' => 'monthly', 'priority' => '0.7'],
        ['route' => 'register', 'changefreq' => 'yearly', 'priority' => '0.5'],
        ['route' => 'login', 'changefreq' => 'yearly', 'priority' => '0.3'],
    ];

    public function __invoke(): Response
    {
        $urls = collect(self::PAGES)->map(fn (array $page) => sprintf(
            "    <url>\n        <loc>%s</loc>\n        <changefreq>%s</changefreq>\n        <priority>%s</priority>\n    </url>",
            e(route($page['route'])),
            $page['changefreq'],
            $page['priority'],
        ))->implode("\n");

        $xml = <<<XML
            <?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            {$urls}
            </urlset>
            XML;

        return response($xml."\n", 200, ['Content-Type' => 'application/xml']);
    }
}
