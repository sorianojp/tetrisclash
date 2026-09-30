<?php

test('returns a successful response', function () {
    $response = $this->get(route('home'));

    $response->assertOk();
});

test('pages describe the site for search engines and link previews', function () {
    $this->get(route('home'))
        ->assertOk()
        ->assertSee('<meta name="description" content="Free 1v1 online Tetris battles.', false)
        ->assertSee('<meta property="og:title" content="'.config('app.name').'">', false)
        ->assertSee('<meta property="og:url" content="'.route('home').'">', false);
});
