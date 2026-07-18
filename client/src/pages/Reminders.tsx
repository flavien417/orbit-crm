import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, differenceInDays, isAfter, addDays } from "date-fns";
import type { Contact, Reminder } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Trash2, X, Plus, Cake, CalendarDays, Clock, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import AddReminderDialog from "@/components/AddReminderDialog";
import { useState } from "react";
import { initials, avatarBg } from "@/lib/utils";

function ContactAvatar({ contact }: { contact: Contact }) {
  const bg = avatarBg(contact.firstName + contact.lastName);
  if (contact.photo) return <img src={contact.photo} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ backgroundColor: bg }}>
      {initials(contact.firstName, contact.lastName)}
    </div>
  );
}

function ReminderTypeIcon({ type }: { type: string }) {
  if (type === "check_in") return <Clock size={15} className="text-orange-500" />;
  return <CalendarDays size={15} className="text-amber-500" />;
}

function daysBadge(dueDate: string) {
  const today = new Date();
  const d = differenceInDays(parseISO(dueDate), today);
  if (d < 0) return <Badge variant="destructive" className="text-xs">{Math.abs(d)}d overdue</Badge>;
  if (d === 0) return <Badge className="text-xs">Today</Badge>;
  if (d <= 7) return <Badge variant="default" className="text-xs">{d}d</Badge>;
  return <Badge variant="secondary" className="text-xs">{d}d</Badge>;
}

export default function Reminders() {
  const [addOpen, setAddOpen] = useState(false);
  const today = new Date();

  const { data: reminders = [], isLoading: rLoading } = useQuery<Reminder[]>({ queryKey: ["/api/reminders"] });
  const { data: contacts = [] } = useQuery<Contact[]>({ queryKey: ["/api/contacts"] });

  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/reminders/${id}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/reminders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/reminders/${id}`),
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

  const active = reminders.filter((r) => !r.isDismissed);
  const dismissed = reminders.filter((r) => r.isDismissed);

  // Upcoming birthdays from contacts with birthday set
  const upcomingBirthdays = contacts
    .filter((c) => c.birthday)
    .map((c) => {
      const bday = parseISO(c.birthday!);
      const thisYear = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const nextYear = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
      const target = isAfter(thisYear, today) || thisYear.toDateString() === today.toDateString() ? thisYear : nextYear;
      return { contact: c, date: target, daysUntil: differenceInDays(target, today) };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 20);

  // Check-in reminders with computed days until
  const checkInReminders = active.filter((r) => r.type === "check_in").map((r) => {
    const contact = contacts.find((c) => c.id === r.contactId);
    let daysUntil = 0;
    if (r.dueDate) {
      daysUntil = differenceInDays(parseISO(r.dueDate), today);
    } else if (r.checkInAfterDays && contact?.lastContactedAt) {
      const due = addDays(parseISO(contact.lastContactedAt), r.checkInAfterDays);
      daysUntil = differenceInDays(due, today);
    } else if (r.checkInAfterDays) {
      daysUntil = -r.checkInAfterDays;
    }
    return { ...r, contact, daysUntil };
  }).sort((a, b) => a.daysUntil - b.daysUntil);

  const getContact = (id: number | null | undefined) => id ? contacts.find((c) => c.id === id) : undefined;

  function ReminderRow({ r }: { r: Reminder }) {
    const contact = getContact(r.contactId);
    return (
      <div className="flex items-center gap-3 px-4 py-3 group">
        <ReminderTypeIcon type={r.type} />
        {contact && <ContactAvatar contact={contact} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{r.title}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {contact && (
              <Link href={`/contacts/${contact.id}`} className="text-xs text-muted-foreground hover:text-primary">
                {contact.firstName} {contact.lastName}
              </Link>
            )}
            {r.dueDate && (
              <span className="text-xs text-muted-foreground">{format(parseISO(r.dueDate), "MMM d, yyyy")}</span>
            )}
            {r.isRecurring && <Badge variant="outline" className="text-xs h-4 px-1">Recurring</Badge>}
          </div>
        </div>
        {r.dueDate && daysBadge(r.dueDate)}
        {!r.isDismissed && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => dismissMutation.mutate(r.id!)}
            data-testid={`button-dismiss-${r.id}`}
            title="Dismiss"
          >
            <CheckCircle2 size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => deleteMutation.mutate(r.id!)}
          data-testid={`button-delete-${r.id}`}
          title="Delete"
        >
          <Trash2 size={13} />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reminders</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{reminders.length} reminder{reminders.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-reminder-global">
          <Plus size={16} className="mr-1.5" />
          Add reminder
        </Button>
      </div>

      <Tabs defaultValue="checkins">
        <TabsList>
          <TabsTrigger value="checkins">Check-ins</TabsTrigger>
          <TabsTrigger value="events">Events & Custom</TabsTrigger>
          <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
        </TabsList>

        {/* Check-in reminders */}
        <TabsContent value="checkins">
          <Card className="overflow-hidden">
            {rLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12" />)}
              </div>
            ) : checkInReminders.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-6">
                <Clock size={36} className="text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium mb-1">No check-in reminders</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                  Add a check-in reminder to be reminded when to reach out to someone.
                </p>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} className="mr-1.5" />
                  Add check-in
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {checkInReminders.map((r) => {
                  const isOverdue = r.daysUntil < 0;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3 group">
                      <Clock size={15} className={isOverdue ? "text-destructive" : "text-orange-500"} />
                      {r.contact && <ContactAvatar contact={r.contact} />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{r.title}</p>
                        {r.contact && (
                          <Link href={`/contacts/${r.contact.id}`} className="text-xs text-muted-foreground hover:text-primary">
                            {r.contact.firstName} {r.contact.lastName}
                          </Link>
                        )}
                        {r.checkInAfterDays && (
                          <span className="text-xs text-muted-foreground ml-1">· every {r.checkInAfterDays}d</span>
                        )}
                      </div>
                      {isOverdue ? (
                        <span className="text-xs font-bold text-destructive shrink-0">OVERDUE</span>
                      ) : (
                        <Badge
                          variant={r.daysUntil === 0 ? "default" : r.daysUntil <= 14 ? "default" : "secondary"}
                          className="text-xs shrink-0"
                        >
                          {r.daysUntil === 0 ? "Today" : `${r.daysUntil}d`}
                        </Badge>
                      )}
                      {r.contact && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2 shrink-0"
                          onClick={() => logContactMutation.mutate(r.contact!.id!)}
                          data-testid={`button-log-checkin-${r.id}`}
                        >
                          <CheckCircle2 size={13} className="mr-1" />
                          Done
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteMutation.mutate(r.id!)}
                        data-testid={`button-delete-checkin-${r.id}`}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Event reminders */}
        <TabsContent value="events">
          <Card className="overflow-hidden">
            {rLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12" />)}
              </div>
            ) : active.filter(r => r.type === "event").length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-6">
                <Bell size={36} className="text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium mb-1">No event reminders</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-xs">
                  Add reminders for anniversaries, events, and anything else.
                </p>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} className="mr-1.5" />
                  Add event reminder
                </Button>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {active.filter(r => r.type === "event").map((r) => (
                  <li key={r.id}><ReminderRow r={r} /></li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Birthdays from contacts */}
        <TabsContent value="birthdays">
          <Card className="overflow-hidden">
            {upcomingBirthdays.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center px-6">
                <Cake size={36} className="text-muted-foreground/30 mb-3" />
                <h3 className="text-sm font-medium mb-1">No birthdays on file</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Add birthdays to your contacts and they'll appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {upcomingBirthdays.map(({ contact, date, daysUntil }) => (
                  <li key={contact.id} className="flex items-center gap-3 px-4 py-3">
                    <Cake size={15} className="text-rose-500 shrink-0" />
                    <ContactAvatar contact={contact} />
                    <div className="flex-1 min-w-0">
                      <Link href={`/contacts/${contact.id}`} className="text-sm font-medium hover:text-primary">
                        {contact.firstName} {contact.lastName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{format(date, "MMMM d")}</p>
                    </div>
                    <Badge
                      variant={daysUntil === 0 ? "destructive" : daysUntil <= 7 ? "default" : "secondary"}
                      className="text-xs shrink-0"
                    >
                      {daysUntil === 0 ? "Today!" : `${daysUntil}d`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Dismissed */}
        <TabsContent value="dismissed">
          <Card className="overflow-hidden">
            {dismissed.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No dismissed reminders.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border opacity-60">
                {dismissed.map((r) => (
                  <li key={r.id}><ReminderRow r={r} /></li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AddReminderDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
