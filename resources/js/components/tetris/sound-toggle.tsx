import { Volume2, VolumeX } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { setSoundOn, setSoundVolume, soundSettings } from '@/tetris/sound';

/** Sound on/off, plus a volume slider while it's on. */
export function SoundToggle() {
    const { on, volume } = useSyncExternalStore(
        soundSettings.subscribe,
        soundSettings.get,
        soundSettings.get,
    );

    return (
        <div className="flex items-center gap-2">
            <Button
                variant="outline"
                size="sm"
                onClick={() => setSoundOn(!on)}
                aria-pressed={on}
                title={on ? 'Turn sound off' : 'Turn sound on'}
            >
                {on ? <Volume2 /> : <VolumeX />}
                Sound {on ? 'on' : 'off'}
            </Button>
            {on && (
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(event) =>
                        setSoundVolume(Number(event.target.value))
                    }
                    aria-label="Volume"
                    className="w-20 accent-primary"
                />
            )}
        </div>
    );
}
