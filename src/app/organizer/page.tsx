"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarCheck,
  CheckCircle,
  Clock,
  LayoutDashboard,
  Loader,
  Plus,
  Ticket,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react"
import { useOrganizerGuard } from "@/hooks/useOrganizerGuard"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ContactCollaborate } from "@/components/organizer/contact-collaborate"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"

interface DashboardData {
  event_counts: {
    draft: number
    pending: number
    approved: number
    rejected: number
    cancelled: number
  }
  totals: { revenue: number; tickets: number; bookings: number; checked_in: number }
  top_events: {
    event_id: string
    title: string
    revenue: number
    tickets: number
    bookings: number
  }[]
  recent_bookings: {
    id: string
    booking_reference: string
    event_title: string
    number_of_tickets: number
    total_amount: number | string
    attendee_name: string | null
    created_at: string
  }[]
}

interface Balance {
  pending: number
  net: number
  gross: number
  paid_out: number
  platform_fee_pct: number
}

// Drafts tile omitted — the draft flow has been removed from the product.
// The API still returns a `draft` count for back-compat, but it's not surfaced
// in the dashboard summary.
const STATUS_META: Record<
  Exclude<keyof DashboardData["event_counts"], "draft">,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  pending: { label: "Pending", icon: Clock, tone: "text-amber-600 dark:text-amber-400" },
  approved: { label: "Live", icon: CheckCircle, tone: "text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "Rejected", icon: XCircle, tone: "text-destructive" },
  cancelled: { label: "Cancelled", icon: XCircle, tone: "text-muted-foreground" },
}

const formatLkr = (n: number | string) => {
  const v = typeof n === "string" ? Number(n) : n
  return `LKR ${(v || 0).toLocaleString()}`
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

// Shared card surface — shadow-based elevation instead of a border, so
// content reads as one clean panel rather than a bordered box with a
// separate divider-header strip.
const CARD = "rounded-2xl bg-card shadow-sm dark:ring-1 dark:ring-white/10"

export default function OrganizerDashboardPage() {
  const { user, loading: authLoading } = useOrganizerGuard("/organizer")

  const [data, setData] = React.useState<DashboardData | null>(null)
  const [balance, setBalance] = React.useState<Balance | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!user || (user.role !== "organizer" && user.role !== "superadmin")) return
    Promise.all([
      fetch(`${API_URL}/api/organizer/events/dashboard`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${API_URL}/api/organizer/payouts/balance`, { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([dashRes, balRes]) => {
        if (!dashRes?.success) {
          setError(dashRes?.message || "Failed to load dashboard.")
          return
        }
        setData(dashRes.data as DashboardData)
        if (balRes?.success) setBalance(balRes.data.balance)
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false))
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-foreground">Couldn&rsquo;t load dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  const firstName = user?.name?.split(" ")[0] ?? "there"
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  const pendingEvents = data.event_counts.pending ?? 0
  const rejectedEvents = data.event_counts.rejected ?? 0
  const needsAttention = pendingEvents > 0 || rejectedEvents > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          {user?.profileImage ? (
            <Image
              src={user.profileImage}
              alt={firstName}
              width={56}
              height={56}
              className="h-14 w-14 shrink-0 rounded-2xl border border-border object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LayoutDashboard className="h-6 w-6" />
            </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {today}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {greeting()}, {firstName}
            </h1>
          </div>
        </div>
        <Button asChild className="shrink-0">
          <Link href="/organizer/events/create">
            <Plus /> Create event
          </Link>
        </Button>
      </header>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          feature
          icon={TrendingUp}
          label="Revenue"
          value={formatLkr(data.totals.revenue)}
          hint={`${data.totals.bookings.toLocaleString()} bookings`}
        />
        <KpiCard
          icon={Ticket}
          label="Tickets sold"
          value={data.totals.tickets.toLocaleString()}
          hint="all-time"
        />
        <KpiCard
          icon={Users}
          label="Checked in"
          value={data.totals.checked_in.toLocaleString()}
          hint="at the door"
        />
        <KpiCard
          icon={Banknote}
          label="Pending payout"
          value={balance ? formatLkr(balance.pending) : "-"}
          hint={balance ? `${(balance.platform_fee_pct * 100).toFixed(1)}% platform fee` : undefined}
        />
      </section>

      {/* Needs attention */}
      {needsAttention && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> Needs attention
          </span>
          {pendingEvents > 0 && (
            <AttentionChip
              label={`${pendingEvents} event${pendingEvents > 1 ? "s" : ""} awaiting approval`}
            />
          )}
          {rejectedEvents > 0 && (
            <AttentionChip
              label={`${rejectedEvents} event${rejectedEvents > 1 ? "s" : ""} rejected`}
            />
          )}
        </section>
      )}

      {/* Events status strip */}
      <section className={CARD}>
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-base font-semibold text-foreground">Events overview</h2>
          <Link
            href="/organizer/events"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:underline"
          >
            Manage all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map((key) => {
            const meta = STATUS_META[key]
            const Icon = meta.icon
            const count = data.event_counts[key] ?? 0
            return (
              <div key={key} className="px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.tone}`} />
                  <span className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{meta.label}</span>
                </div>
                <div className="mt-1 text-lg sm:text-xl font-bold text-foreground">{count}</div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Contact & collaborate with the MyScope team */}
      <ContactCollaborate subtitle="connect with us for your event procedure." />

      {/* Top events + Recent bookings */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top events */}
        <div className={CARD}>
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Top events</h3>
              <p className="text-sm text-muted-foreground">By revenue, all time</p>
            </div>
          </div>
          <div className="mt-2 pb-2">
          {data.top_events.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No revenue recorded yet"
              subtitle="Top-earning events will rank here once bookings come in."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const maxRevenue = Math.max(...data.top_events.slice(0, 5).map((e) => e.revenue), 1)
                  return data.top_events.slice(0, 5).map((e, idx) => (
                    <TableRow key={e.event_id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/organizer/events/${e.event_id}`}
                              className="line-clamp-1 text-sm font-medium text-foreground transition-colors hover:text-primary"
                            >
                              {e.title}
                            </Link>
                            <div className="mt-1.5 h-1.5 w-28 max-w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.max(4, (e.revenue / maxRevenue) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.tickets.toLocaleString()} · {e.bookings.toLocaleString()} bookings
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold text-foreground">
                        {formatLkr(e.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                })()}
              </TableBody>
            </Table>
          )}
          </div>
        </div>

        {/* Recent bookings */}
        <div className={CARD}>
          <div className="flex items-start justify-between px-5 pt-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Recent bookings</h3>
              <p className="text-sm text-muted-foreground">Latest 5</p>
            </div>
          </div>
          <div className="mt-2 pb-2">
          {data.recent_bookings.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No bookings yet"
              subtitle="New bookings across your events will show up here as they come in."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_bookings.slice(0, 5).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="line-clamp-1 text-sm font-medium text-foreground">
                        {b.event_title}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {b.attendee_name ?? "Anonymous"} ·{" "}
                        {b.number_of_tickets} ticket{b.number_of_tickets === 1 ? "" : "s"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(b.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-foreground">
                      {formatLkr(b.total_amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </div>
        </div>
      </section>

      {/* Payout summary */}
      {balance && (
        <section className={CARD}>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-base font-semibold text-foreground">Payouts</h3>
            <Button asChild variant="outline" size="sm">
              <Link href="/organizer/payouts">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-2 divide-y divide-border pb-1 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <BalanceMetric label="Pending" value={formatLkr(balance.pending)} accent />
            <BalanceMetric label="Gross" value={formatLkr(balance.gross)} />
            <BalanceMetric label="Net" value={formatLkr(balance.net)} />
            <BalanceMetric label="Paid out" value={formatLkr(balance.paid_out)} />
          </div>
        </section>
      )}
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  feature,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  hint?: string
  /** Elevates this card in solid primary fill as the headline metric. */
  feature?: boolean
}) {
  return (
    <div className={feature ? `${CARD} bg-primary text-primary-foreground` : CARD}>
      <div className="px-3.5 py-3">
        <div className="flex items-center justify-between">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${feature ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
            {label}
          </span>
          <Icon className={`h-4 w-4 shrink-0 ${feature ? "text-primary-foreground/80" : "text-muted-foreground"}`} />
        </div>
        {/* truncate guards against long currency strings (e.g. "LKR 12,345,678")
            breaking the 2-col mobile layout. */}
        <p className="mt-1.5 truncate text-xl font-bold leading-tight tracking-tight">{value}</p>
        {hint && (
          <p className={`mt-0.5 truncate text-[11px] ${feature ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {hint}
          </p>
        )}
      </div>
    </div>
  )
}

function AttentionChip({ label }: { label: string }) {
  return (
    <Link
      href="/organizer/events"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-card px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:border-amber-900/50 dark:text-amber-200 dark:hover:bg-amber-900/40"
    >
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

/** Illustrated empty state for a dashboard section — matches the dashed-border
 *  + circular icon badge idiom used on the Events page. */
function EmptyState({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-xs text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function BalanceMetric({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="px-4 py-3 sm:px-5 sm:py-4">
      <div className="text-[11px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
        {label}
      </div>
      <div
        className={
          accent
            ? "mt-1 truncate text-base sm:text-lg font-bold text-foreground"
            : "mt-1 truncate text-sm sm:text-base font-semibold text-foreground"
        }
      >
        {value}
      </div>
    </div>
  )
}

