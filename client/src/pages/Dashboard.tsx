import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format, formatDistanceToNow, differenceInDays, parseISO, isAfter, addDays } from "date-fns";
import type { Contact, Reminder } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { initials, avatarBg, parseJSON } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Bell, Clock, Cake, CheckCircle2, TrendingUp } from "lucide-react";

function ContactAvatar({ contact }: { contact: Contact }) {
  const bg = avatarBg(contact.firstName + contact.lastName);
  if (contact.photo) {
    return (
      <img src={contact.photo} alt={contact.firstName} className="w-10 h-10 rounded-full object-cover shrink-0" />
    );
  }
  return (
    <div
      className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-white text-sm font-semibold"
      style={{ backgroundColor: bg }}
    >
      {initials(contact.firstName, contact.lastName)}
    </div>
  );
}

interface CheckInItem {
  contact: Contact;
  reminder: Reminder;
  /** null = overdue, positive = days until due */
  daysUntil: number | null;
  title: string;
}

export default function Dashboard() {
  const { data: contacts = [], isLoading: cLoading } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });
  const { data: reminders = [], isLoading: rLoading } = useQuery<Reminder[]>({ queryKey: ["/api/reminders"] });

  const today = new Date();

  // ── Upcoming check-ins: all non-dismissed check_in reminders, sorted soonest first ──
  const checkInItems: CheckInItem[] = reminders
    .filter((r) => r.type === "check_in" && !r.isDismissed)
    .map((r) => {
      const contact = contacts.find((c) => c.id === r.contactId);
      if (!contact) return null;

      let daysUntil: number | null = null;

      if (r.dueDate) {
        // dueDate is set — compute days until
        const d = differenceInDays(parseISO(r.dueDate), today);
        daysUntil = d; // negative = overdue
      } else if (r.checkInAfterDays) {
        // No dueDate yet — compute from lastContactedAt
        if (contact.lastContactedAt) {
          const due = addDays(parseISO(contact.lastContactedAt), r.checkInAfterDays);
          daysUntil = differenceInDays(due, today);
        } else {
          // Never contacted → overdue immediately
          daysUntil = -(r.checkInAfterDays ?? 180);
        }
      }

      return { contact, reminder: r, daysUntil, title: r.title };
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Sort: overdue first (most overdue first), then soonest upcoming
      const aD = a!.daysUntil ?? 0;
      const bD = b!.daysUntil ?? 0;
      return aD - bD;
    })
    .slice(0, 5) as CheckInItem[];

  // Count overdue check-ins for stat card
  const overdueCount = checkInItems.filter((ci) => (ci.daysUntil ?? 0) < 0).length;

  // Upcoming birthdays (next 30 days)
  const upcomingBirthdays = contacts.filter((c) => {
    if (!c.birthday) return false;
    const bday = parseISO(c.birthday);
    const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
    const target = isAfter(thisYear, today) ? thisYear : nextYear;
    return differenceInDays(target, today) <= 30;
  }).slice(0, 5);

  // Due reminders (event type, not dismissed, due within 7 days or overdue)
  const dueReminders = reminders.filter((r) => {
    if (r.isDismissed) return false;
    if (r.type !== "event" || !r.dueDate) return false;
    const days = differenceInDays(parseISO(r.dueDate), today);
    return days <= 7;
  }).slice(0, 5);

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/reminders/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reminders"] }),
  });

  const logContactMutation = useMutation({
    mutationFn: (contactId: number) =>
      apiRequest("POST", `/api/contacts/${contactId}/interactions`, {
        contactedAt: new Date().toISOString(),
        note: "",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
    },
  });

  const stats = [
    { label: "Total contacts", value: contacts.length, icon: Users, color: "text-primary" },
    { label: "Check-ins overdue", value: overdueCount, icon: Clock, color: "text-orange-500" },
    { label: "Upcoming birthdays", value: upcomingBirthdays.length, icon: Cake, color: "text-rose-500" },
    { label: "Pending reminders", value: dueReminders.length, icon: Bell, color: "text-amber-500" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {format(today, "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <s.icon size={20} className={`shrink-0 ${s.color}`} />
            <div>
              <p className="text-2xl font-bold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming check-ins */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-orange-500" />
              <h2 className="text-sm font-semibold">Upcoming check-ins</h2>
            </div>
            <Link href="/reminders" className="text-xs text-primary hover:underline">See all</Link>
          </div>
          {cLoading || rLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : checkInItems.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center px-4">
              <TrendingUp size={32} className="text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No check-in reminders set up yet.</p>
              <Link href="/reminders" className="text-xs text-primary hover:underline mt-1">Add one</Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {checkInItems.map((ci) => {
                const isOverdue = (ci.daysUntil ?? 0) < 0;
                const daysLabel = isOverdue
                  ? null
                  : ci.daysUntil === 0
                  ? "Today"
                  : `${ci.daysUntil}d`;

                return (
                  <li key={ci.reminder.id} className="flex items-center gap-3 px-4 py-3 group">
                    <ContactAvatar contact={ci.contact} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/contacts/${ci.contact.id}`} className="text-sm font-medium hover:text-primary truncate block">
                        {ci.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {ci.contact.lastContactedAt
                          ? `Last contact: ${formatDistanceToNow(parseISO(ci.contact.lastContactedAt))} ago`
                          : "Never contacted"}
                      </p>
                    </div>
                    {isOverdue ? (
                      <span className="text-xs font-bold text-destructive shrink-0">OVERDUE</span>
                    ) : (
                      <Badge variant={ci.daysUntil === 0 ? "default" : ci.daysUntil! <= 14 ? "default" : "secondary"} className="text-xs shrink-0">
                        {daysLabel}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2 shrink-0"
                      data-testid={`button-log-contact-${ci.contact.id}`}
                      onClick={() => logContactMutation.mutate(ci.contact.id!)}
                    >
                      <CheckCircle2 size={13} className="mr-1" />
                      Done
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Upcoming birthdays */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Cake size={16} className="text-rose-500" />
              <h2 className="text-sm font-semibold">Upcoming birthdays</h2>
              <Badge variant="secondary" className="text-xs">30 days</Badge>
            </div>
          </div>
          {cLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingBirthdays.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center px-4">
              <Cake size={32} className="text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No birthdays in the next 30 days.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcomingBirthdays.map((c) => {
                const bday = parseISO(c.birthday!);
                const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
                const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
                const target = isAfter(thisYear, today) ? thisYear : nextYear;
                const daysUntil = differenceInDays(target, today);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <ContactAvatar contact={c} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:text-primary truncate block">
                        {c.firstName} {c.lastName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{format(target, "MMMM d")}</p>
                    </div>
                    <Badge
                      variant={daysUntil === 0 ? "destructive" : daysUntil <= 3 ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {daysUntil === 0 ? "Today!" : `${daysUntil}d`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Due event reminders */}
        <Card className="overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold">Event reminders due soon</h2>
            </div>
            <Link href="/reminders" className="text-xs text-primary hover:underline">Manage all</Link>
          </div>
          {rLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12" />)}
            </div>
          ) : dueReminders.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center px-4">
              <Bell size={32} className="text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No event reminders due within 7 days.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {dueReminders.map((r) => {
                const daysUntil = r.dueDate ? differenceInDays(parseISO(r.dueDate), today) : 0;
                const contact = contacts.find((c) => c.id === r.contactId);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <Bell size={16} className={daysUntil < 0 ? "text-destructive" : "text-amber-500"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.title}</p>
                      {contact && (
                        <Link href={`/contacts/${contact.id}`} className="text-xs text-muted-foreground hover:text-primary">
                          {contact.firstName} {contact.lastName}
                        </Link>
                      )}
                      {r.dueDate && (
                        <p className="text-xs text-muted-foreground">{format(parseISO(r.dueDate), "MMM d, yyyy")}</p>
                      )}
                    </div>
                    <Badge variant={daysUntil < 0 ? "destructive" : "secondary"} className="text-xs shrink-0">
                      {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : daysUntil === 0 ? "Today" : `${daysUntil}d`}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs h-7 px-2 text-muted-foreground"
                      data-testid={`button-dismiss-reminder-${r.id}`}
                      onClick={() => dismissMutation.mutate(r.id!)}
                    >
                      Dismiss
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
