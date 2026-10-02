import { router } from '@inertiajs/react';
import { Check, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RouteDefinition } from '@/wayfinder';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * A button that asks before sending an admin action. With `reasonLabel`, the dialog also
 * collects an optional reason, sent as `reason`.
 */
export function ConfirmAction({
    action,
    title,
    description,
    confirmLabel,
    reasonLabel,
    destructive = true,
    children,
    size = 'sm',
    variant,
}: {
    action: RouteDefinition<Method>;
    title: string;
    description?: ReactNode;
    confirmLabel: string;
    reasonLabel?: string;
    destructive?: boolean;
    children: ReactNode;
    size?: 'sm' | 'default';
    variant?: 'outline' | 'destructive' | 'ghost' | 'secondary';
}) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState('');
    const [processing, setProcessing] = useState(false);

    const submit = () =>
        router.visit(action.url, {
            method: action.method,
            data: reasonLabel ? { reason: reason.trim() || null } : {},
            preserveScroll: true,
            onStart: () => setProcessing(true),
            onFinish: () => setProcessing(false),
            onSuccess: () => {
                setOpen(false);
                setReason('');
            },
        });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    size={size}
                    variant={variant ?? (destructive ? 'outline' : 'secondary')}
                >
                    {children}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && (
                        <DialogDescription>{description}</DialogDescription>
                    )}
                </DialogHeader>
                {reasonLabel && (
                    <div className="grid gap-2">
                        <Label htmlFor="confirm-reason">{reasonLabel}</Label>
                        <Input
                            id="confirm-reason"
                            value={reason}
                            maxLength={255}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Optional"
                        />
                    </div>
                )}
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">
                            <X /> Cancel
                        </Button>
                    </DialogClose>
                    <Button
                        variant={destructive ? 'destructive' : 'default'}
                        disabled={processing}
                        onClick={submit}
                    >
                        {destructive ? <TriangleAlert /> : <Check />}
                        {confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
