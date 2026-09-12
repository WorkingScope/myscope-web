import type { Metadata } from "next"

export const metadata: Metadata = {
  title: { absolute: "Delete Your Account | MyScope Ticketing Platform" },
  description:
    "How to request deletion of your MyScope account and personal data, for the web platform, the organizer app, and the mobile app.",
  alternates: { canonical: "https://www.myscope.lk/delete-account" },
  openGraph: {
    title: "Delete Your Account | MyScope Ticketing Platform",
    description:
      "How to request deletion of your MyScope account and personal data, for the web platform, the organizer app, and the mobile app.",
    url: "https://www.myscope.lk/delete-account",
    type: "website",
  },
}

const SECTIONS: { h: string; p: string[] }[] = [
  {
    h: "1. How to request deletion",
    p: [
      "Send an email to hello@myscope.lk from the email address on your MyScope account, with the subject \"Account Deletion Request\". Please let us know which account you'd like deleted (attendee, organizer, or both) so we can find it quickly.",
    ],
  },
  {
    h: "2. What gets deleted",
    p: [
      "Once we verify your request, we delete your profile information (name, email, phone number), saved login credentials, device push tokens, and any other personal information tied to your account.",
    ],
  },
  {
    h: "3. What we may retain, and why",
    p: [
      "Records of completed bookings, shop orders, and payouts may be kept for the period required by applicable tax, accounting, and consumer-protection law, and to handle disputes or fraud investigations. Where possible, this data is retained in a form that is no longer linked to your identity.",
    ],
  },
  {
    h: "4. Organizer accounts",
    p: [
      "If your organizer account has upcoming events, tickets already sold, or a pending payout, we'll need to resolve those first — for example by completing or cancelling the event and settling any payout — before the account itself can be deleted. Your attendees' own booking records are not affected by your account deletion.",
    ],
  },
  {
    h: "5. Timeframe",
    p: [
      "We aim to action verified deletion requests within a reasonable time of receiving them, and will let you know once it's done.",
    ],
  },
  {
    h: "6. Contact",
    p: ["Questions about deleting your account? Email hello@myscope.lk."],
  },
]

export default function DeleteAccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Delete Your Account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: 12 September 2026</p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="text-lg font-semibold text-foreground">{s.h}</h2>
            {s.p.map((para, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {para}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
