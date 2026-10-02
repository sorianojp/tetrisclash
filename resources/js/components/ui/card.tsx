import * as React from "react"

import { cn } from "@/lib/utils"

/** The coloured strip across the top of a card, like the player cards in the match intro. */
const ACCENTS = {
  violet: "from-indigo-500 via-violet-500 to-fuchsia-500",
  amber: "from-amber-300 via-amber-400 to-orange-400",
  rose: "from-rose-400 via-pink-500 to-fuchsia-500",
  cyan: "from-cyan-400 via-sky-400 to-indigo-400",
  emerald: "from-emerald-400 via-teal-400 to-cyan-400",
} as const

export type CardAccent = keyof typeof ACCENTS

function Card({
  className,
  accent,
  children,
  ...props
}: React.ComponentProps<"div"> & { accent?: CardAccent }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground relative flex flex-col gap-6 rounded-2xl border py-6 shadow-sm dark:bg-gradient-to-b dark:from-white/[0.035] dark:to-transparent dark:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05),0_24px_48px_-28px_rgb(0_0_0/0.9)]",
        accent && "overflow-hidden",
        className
      )}
      {...props}
    >
      {accent && (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r", ACCENTS[accent])}
        />
      )}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 px-6", className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("flex items-center gap-2 leading-none font-bold tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6", className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
