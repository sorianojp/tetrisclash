import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { OPPONENT_LAYOUT, drawOpponent, prepareCanvas } from '@/tetris/render';

export type OpponentView = { snapshot: string | null; pending: number };

/**
 * Renders the opponent's board from the latest whispered snapshot. Reads
 * from a ref on every frame so frequent updates don't re-render React.
 */
export function OpponentField({
    view,
    cell,
}: {
    view: RefObject<OpponentView>;
    cell: number;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let frame = 0;
        let drawn: string | null | undefined;
        let drawnPending = -1;

        const loop = () => {
            const canvas = canvasRef.current;
            const { snapshot, pending } = view.current;

            if (canvas && (snapshot !== drawn || pending !== drawnPending)) {
                const ctx = prepareCanvas(
                    canvas,
                    OPPONENT_LAYOUT.width * cell,
                    OPPONENT_LAYOUT.height * cell,
                );
                drawOpponent(ctx, snapshot, pending, cell);
                drawn = snapshot;
                drawnPending = pending;
            }

            frame = requestAnimationFrame(loop);
        };

        frame = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(frame);
    }, [view, cell]);

    return <canvas ref={canvasRef} className="block" />;
}
