import { Link, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { Card } from '@/components/ui/card';
import { home } from '@/routes';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    const { name } = usePage().props;

    return (
        <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden bg-background p-6 md:p-10">
            {/* The landing page's glows, over a faint board grid. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_20%_10%,rgb(139_92_246/0.18),transparent),radial-gradient(ellipse_45%_40%_at_85%_90%,rgb(244_63_94/0.14),transparent)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(139_92_246/0.06)_1px,transparent_1px),linear-gradient(90deg,rgb(139_92_246/0.06)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] bg-[size:40px_40px]"
            />

            <div className="relative w-full max-w-sm">
                <div className="flex flex-col gap-6">
                    <Link
                        href={home()}
                        className="flex items-center justify-center gap-2.5"
                    >
                        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/40">
                            <AppLogoIcon className="size-6 fill-white" />
                        </span>
                        <span className="text-lg font-black tracking-wide uppercase">
                            {name}
                        </span>
                    </Link>

                    <Card className="gap-6 px-6 py-7 sm:px-8">
                        <div className="space-y-1.5 text-center">
                            <h1 className="text-2xl font-black tracking-tight">
                                {title}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {description}
                            </p>
                        </div>
                        {children}
                    </Card>
                </div>
            </div>
        </div>
    );
}
