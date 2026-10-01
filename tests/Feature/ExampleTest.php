<?php

test('returns a successful response', function () {
    $response = $this->get(route('home'));

    $response->assertOk();
});

test('pages describe the site for search engines and link previews', function () {
    $this->get(route('home'))
        ->assertOk()
        ->assertSee('<meta name="description" content="Free 1v1 online Tetris battles.', false)
        ->assertSee('<meta property="og:title" content="'.config('app.name').' - Online Tetris battles">', false)
        ->assertSee('<meta property="og:url" content="'.route('home').'">', false)
        ->assertSee('<meta property="og:image" content="'.asset('og-image.png').'">', false)
        ->assertSee('<meta name="twitter:card" content="summary_large_image">', false)
        ->assertSee('{"@context":"https://schema.org","@type":"WebSite","name":"'.config('app.name').'"', false);
});

test('the link preview image exists', function () {
    expect(public_path('og-image.png'))->toBeFile();
});

test('pages can give their own title and description', function () {
    $this->get(route('practice'))
        ->assertOk()
        ->assertSee('<meta property="og:title" content="Play Tetris online: sprint, ultra, dig and more">', false)
        ->assertSee('<title>Play Tetris online: sprint, ultra, dig and more</title>', false)
        ->assertSee('<meta name="description" content="Play free Tetris practice modes in your browser', false);
});

test('the sitemap lists the public pages', function () {
    $this->get('/sitemap.xml')
        ->assertOk()
        ->assertHeader('Content-Type', 'application/xml')
        ->assertSee('<loc>'.route('home').'</loc>', false)
        ->assertSee('<loc>'.route('practice').'</loc>', false)
        ->assertSee('<loc>'.route('about').'</loc>', false)
        ->assertDontSee(route('dashboard'), false);
});

test('robots.txt points crawlers at the sitemap', function () {
    expect(file_get_contents(public_path('robots.txt')))
        ->toContain('Sitemap: https://tetrisclash.com/sitemap.xml')
        ->toContain('Disallow: /internal/');
});
