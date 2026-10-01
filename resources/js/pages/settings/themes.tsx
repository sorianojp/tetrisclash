import { Head, router, usePage } from '@inertiajs/react';
import { Check, Lock, Play } from 'lucide-react';
import { useEffect, useRef } from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { RankBadge } from '@/components/tetris/rank-badge';
import { SoundToggle } from '@/components/tetris/sound-toggle';
import { Button } from '@/components/ui/button';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';
import { edit as editThemes, update as updateThemes } from '@/routes/themes';
import { drawBlock, prepareCanvas } from '@/tetris/render';
import { soundPreviews } from '@/tetris/sound';
import { BOARD_SKINS, PIECE_THEMES } from '@/tetris/themes';
import { useUser } from '@/hooks/use-user';

type Option = { id: string; name: string; rank: number; unlocked: boolean };

/** A little stack that shows off every piece colour and some garbage. */
const SAMPLE = [
    '0000000000',
    '0000000000',
    '0300000000',
    '3330000110',
    '6600552110',
    '6045522770',
    '6444377710',
    '8888808888',
];
const PREVIEW_CELL = 12;

export default function Themes({
    pieces,
    boards,
    rank,
}: {
    pieces: Option[];
    boards: Option[];
    rank: RankProgress;
}) {
    const { errors } = usePage().props;
    const user = useUser();
    const pieceTheme = String(user.piece_theme ?? 'classic');
    const boardSkin = String(user.board_skin ?? 'midnight');

    const choose = (field: 'piece_theme' | 'board_skin', id: string) =>
        router.patch(
            updateThemes().url,
            { [field]: id },
            { preserveScroll: true },
        );

    return (
        <>
            <Head title="Game themes" />
            <h1 className="sr-only">Game themes</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Piece themes"
                    description="Colours for the falling pieces. Higher ranks unlock more."
                />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Your rank: <RankBadge progress={rank} />
                </div>
                <OptionGrid
                    options={pieces}
                    selected={pieceTheme}
                    onChoose={(id) => choose('piece_theme', id)}
                    preview={(id) => ({ pieces: id, board: boardSkin })}
                />
                <InputError message={errors.piece_theme} />
            </div>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Board skins"
                    description="The field and panels around it."
                />
                <OptionGrid
                    options={boards}
                    selected={boardSkin}
                    onChoose={(id) => choose('board_skin', id)}
                    preview={(id) => ({ pieces: pieceTheme, board: id })}
                />
                <InputError message={errors.board_skin} />
            </div>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Sounds"
                    description="Turn sound on, then play any effect to hear it. Combo run plays a chain building up, then breaking."
                />
                <SoundToggle />
                <div className="flex flex-wrap gap-2">
                    {soundPreviews.map(({ label, play }) => (
                        <Button
                            key={label}
                            variant="outline"
                            size="sm"
                            onClick={play}
                        >
                            <Play /> {label}
                        </Button>
                    ))}
                </div>
            </div>
        </>
    );
}

Themes.layout = {
    breadcrumbs: [{ title: 'Game themes', href: editThemes() }],
};

function OptionGrid({
    options,
    selected,
    onChoose,
    preview,
}: {
    options: Option[];
    selected: string;
    onChoose: (id: string) => void;
    preview: (id: string) => { pieces: string; board: string };
}) {
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {options.map((option) => {
                const active = option.id === selected;

                return (
                    <button
                        key={option.id}
                        type="button"
                        disabled={!option.unlocked || active}
                        onClick={() => onChoose(option.id)}
                        className={cn(
                            'flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors',
                            active
                                ? 'border-primary ring-2 ring-primary/30'
                                : option.unlocked
                                  ? 'hover:bg-muted'
                                  : 'cursor-not-allowed opacity-60',
                        )}
                    >
                        <ThemePreview {...preview(option.id)} />
                        <span className="flex items-center gap-1.5 font-medium">
                            {active && <Check className="size-4" />}
                            {!option.unlocked && <Lock className="size-3.5" />}
                            {option.name}
                        </span>
                        {!option.unlocked && (
                            <span className="text-xs text-muted-foreground">
                                Rank {option.rank}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function ThemePreview({ pieces, board }: { pieces: string; board: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;

        if (!canvas) {
            return;
        }

        const palette = PIECE_THEMES[pieces] ?? PIECE_THEMES.classic;
        const skin = BOARD_SKINS[board] ?? BOARD_SKINS.midnight;
        const width = 10 * PREVIEW_CELL;
        const height = SAMPLE.length * PREVIEW_CELL;
        const ctx = prepareCanvas(canvas, width, height);

        ctx.fillStyle = skin.field;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = skin.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);

        SAMPLE.forEach((row, y) =>
            row.split('').forEach((cell, x) => {
                if (cell !== '0') {
                    drawBlock(
                        ctx,
                        x * PREVIEW_CELL,
                        y * PREVIEW_CELL,
                        PREVIEW_CELL,
                        palette[Number(cell)],
                    );
                }
            }),
        );
    }, [pieces, board]);

    return <canvas ref={canvasRef} className="block rounded" />;
}
