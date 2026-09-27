const CONTROLS: [keys: string[], action: string][] = [
    [['←', '→'], 'Move'],
    [['↓'], 'Soft drop'],
    [['Space'], 'Hard drop'],
    [['↑', 'X'], 'Rotate right'],
    [['Z', 'Ctrl'], 'Rotate left'],
    [['C', 'Shift'], 'Hold'],
];

export function ControlsLegend() {
    return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {CONTROLS.map(([keys, action]) => (
                <div key={action} className="contents">
                    <dt className="flex gap-1">
                        {keys.map((key) => (
                            <kbd
                                key={key}
                                className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                            >
                                {key}
                            </kbd>
                        ))}
                    </dt>
                    <dd className="self-center">{action}</dd>
                </div>
            ))}
        </dl>
    );
}
