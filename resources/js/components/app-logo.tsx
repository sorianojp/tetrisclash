import { usePage } from '@inertiajs/react';

import AppLogoIcon from '@/components/app-logo-icon';

export default function AppLogo() {
    const { name } = usePage().props;

    return (
        <>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-md shadow-violet-500/40">
                <AppLogoIcon className="size-5 fill-white drop-shadow" />
            </div>
            <div className="ml-1 grid flex-1 text-left">
                <span className="truncate text-sm leading-tight font-black tracking-wide uppercase">
                    {name}
                </span>
                <span className="truncate text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                    1v1 battles
                </span>
            </div>
        </>
    );
}
