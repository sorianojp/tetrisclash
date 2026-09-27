import { Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { canvasToPng, renderShareCard } from '@/tetris/share-card';
import type { ShareCardData } from '@/tetris/share-card';

type Card = { file: File; url: string };

/**
 * "Share result" button: renders a square result card, previews it, and lets the
 * player download it or hand it to the device's share sheet.
 */
export function ShareResult({
    getCard,
    filename,
    text,
    className,
}: {
    /** Called when the button is pressed, so the card captures the final board. */
    getCard: () => ShareCardData;
    filename: string;
    /** Caption passed along with the image when sharing. */
    text: string;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const [card, setCard] = useState<Card | null>(null);
    const [failed, setFailed] = useState(false);

    // Free the preview image when the dialog closes.
    useEffect(
        () => () => {
            if (card) {
                URL.revokeObjectURL(card.url);
            }
        },
        [card],
    );

    const openDialog = async () => {
        setOpen(true);
        setFailed(false);
        setCard(null);

        try {
            const blob = await canvasToPng(await renderShareCard(getCard()));
            const file = new File([blob], filename, { type: 'image/png' });
            setCard({ file, url: URL.createObjectURL(blob) });
        } catch {
            setFailed(true);
        }
    };

    const canShare =
        card !== null &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [card.file] });

    const share = async () => {
        if (!card) {
            return;
        }

        try {
            await navigator.share({ files: [card.file], text });
        } catch {
            // The player closed the share sheet; nothing to do.
        }
    };

    const download = () => {
        if (!card) {
            return;
        }

        const link = document.createElement('a');
        link.href = card.url;
        link.download = filename;
        link.click();
    };

    return (
        <>
            <Button
                variant="secondary"
                className={className}
                onClick={() => void openDialog()}
            >
                <Share2 /> Share result
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Share your result</DialogTitle>
                        <DialogDescription>
                            A square image, ready for any social feed.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {card ? (
                            <img
                                src={card.url}
                                alt="Your result card"
                                className="size-full object-contain"
                            />
                        ) : failed ? (
                            <p className="p-4 text-center text-sm text-muted-foreground">
                                Couldn&apos;t create the image in this browser.
                            </p>
                        ) : (
                            <Spinner className="size-6" />
                        )}
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button
                            variant="outline"
                            onClick={download}
                            disabled={!card}
                        >
                            <Download /> Download
                        </Button>
                        {canShare && (
                            <Button onClick={() => void share()}>
                                <Share2 /> Share
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
