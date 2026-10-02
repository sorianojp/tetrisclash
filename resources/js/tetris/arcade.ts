/**
 * Arcade lettering for in-game moments (see the arcade-text utility in app.css): a fill colour
 * with a matching solid shade beneath and a glow.
 */
export const ARCADE = {
    /** Countdown numbers. */
    gold: 'arcade-text text-amber-300 [--arcade-shade:#b45309] [--arcade-glow:rgb(251_191_36/0.7)]',
    /** GO!, FINISHED! */
    go: 'arcade-text text-lime-300 [--arcade-shade:#3f6212] [--arcade-glow:rgb(163_230_53/0.7)]',
    /** K.O., OOPS!, TOPPED OUT */
    ko: 'arcade-text text-rose-400 [--arcade-shade:#881337] [--arcade-glow:rgb(244_63_94/0.75)]',
    /** TIME!, the match clock */
    time: 'arcade-text text-sky-300 [--arcade-shade:#075985] [--arcade-glow:rgb(56_189_248/0.7)]',
    /** Neutral headlines and big numbers. */
    plain: 'arcade-text text-white [--arcade-shade:#4c1d95] [--arcade-glow:rgb(167_139_250/0.6)]',
} as const;
