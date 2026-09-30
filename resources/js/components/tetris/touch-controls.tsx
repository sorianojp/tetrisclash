import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ChevronsDown,
    RotateCcw,
    RotateCw,
} from 'lucide-react';
import { useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Action } from '@/tetris/input';

type Controls = {
    press: (action: Action) => void;
    release: (action: Action) => void;
};

/**
 * On-screen buttons for phones and tablets: move, soft drop and hard drop on the left thumb,
 * rotate and hold on the right. Holding left/right repeats like a held key.
 */
export function TouchControls({ controls }: { controls: Controls }) {
    return (
        <div
            className="grid w-full max-w-md touch-none grid-cols-2 gap-3 select-none"
            // A long press shouldn't open the browser's context menu.
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="grid grid-cols-3 gap-2">
                <PadButton
                    action="hold"
                    controls={controls}
                    className="col-span-3 h-11 text-xs font-bold tracking-widest"
                >
                    HOLD
                </PadButton>
                <PadButton action="left" controls={controls} label="Move left">
                    <ArrowLeft />
                </PadButton>
                <PadButton
                    action="softDrop"
                    controls={controls}
                    label="Soft drop"
                >
                    <ArrowDown />
                </PadButton>
                <PadButton
                    action="right"
                    controls={controls}
                    label="Move right"
                >
                    <ArrowRight />
                </PadButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <PadButton
                    action="rotateCCW"
                    controls={controls}
                    label="Rotate left"
                    className="h-11"
                >
                    <RotateCcw />
                </PadButton>
                <PadButton
                    action="rotateCW"
                    controls={controls}
                    label="Rotate right"
                    className="h-11"
                >
                    <RotateCw />
                </PadButton>
                <PadButton
                    action="hardDrop"
                    controls={controls}
                    label="Hard drop"
                    className="col-span-2 bg-primary text-primary-foreground data-[pressed=true]:bg-primary/80"
                >
                    <ChevronsDown />{' '}
                    <span className="text-xs font-bold tracking-widest">
                        DROP
                    </span>
                </PadButton>
            </div>
        </div>
    );
}

function PadButton({
    action,
    controls,
    label,
    className,
    children,
}: {
    action: Action;
    controls: Controls;
    label?: string;
    className?: string;
    children: ReactNode;
}) {
    const [pressed, setPressed] = useState(false);

    const down = (event: PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setPressed(true);
        controls.press(action);

        if (action === 'hardDrop') {
            navigator.vibrate?.(10);
        }
    };

    const up = () => {
        if (pressed) {
            setPressed(false);
            controls.release(action);
        }
    };

    return (
        <button
            type="button"
            aria-label={label}
            data-pressed={pressed}
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={up}
            onLostPointerCapture={up}
            className={cn(
                'flex h-14 items-center justify-center gap-1.5 rounded-xl border bg-muted/60 text-foreground shadow-sm transition-colors [&_svg]:size-6',
                'data-[pressed=true]:scale-95 data-[pressed=true]:bg-muted',
                className,
            )}
        >
            {children}
        </button>
    );
}
