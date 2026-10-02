<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'dark') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "dark" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(0.985 0.006 285);
            }

            html.dark {
                background-color: oklch(0.155 0.03 272);
            }
        </style>

        {{-- Search results and link previews. Kept here rather than in the pages, because
             crawlers read the HTML without running the app's JavaScript. Pages can pass their
             own title and description with ->withViewData(['meta' => [...]]). --}}
        @php($siteDescription = 'Free 1v1 online Tetris battles. Send garbage, score KOs, climb the ranks, and race your friends to 40 lines.')
        @php($metaTitle = $meta['title'] ?? config('app.name').' - Online Tetris battles')
        @php($description = $meta['description'] ?? $siteDescription)
        @php($image = asset('og-image.png'))
        <meta name="description" content="{{ $description }}">
        <link rel="canonical" href="{{ url()->current() }}">
        <meta property="og:type" content="website">
        <meta property="og:site_name" content="{{ config('app.name') }}">
        <meta property="og:title" content="{{ $metaTitle }}">
        <meta property="og:description" content="{{ $description }}">
        <meta property="og:url" content="{{ url()->current() }}">
        <meta property="og:image" content="{{ $image }}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="og:image:alt" content="{{ config('app.name') }}: two boards mid-battle, garbage rising">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{{ $metaTitle }}">
        <meta name="twitter:description" content="{{ $description }}">
        <meta name="twitter:image" content="{{ $image }}">
        <meta name="theme-color" content="#070a17">
        {{-- The site name Google shows above results (it falls back to the bare domain).
             "@@context" is escaped so Blade doesn't read it as its @context directive. --}}
        <script type="application/ld+json">{!! json_encode([
            '@@context' => 'https://schema.org',
            '@type' => 'WebSite',
            'name' => config('app.name'),
            'alternateName' => 'TetrisClash',
            'url' => rtrim(config('app.url'), '/').'/',
            'description' => $siteDescription,
        ], JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) !!}</script>

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">

        @fonts

        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        <x-inertia::head>
            <title>{{ $metaTitle }}</title>
        </x-inertia::head>
    </head>
    <body class="font-sans antialiased">
        <x-inertia::app />
    </body>
</html>
