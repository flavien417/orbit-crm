import { useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import type { Contact, Interaction, Reminder } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  parseJSON, tagColor, initials, avatarBg, CONTACT_METHOD_TYPES
} from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import AddContactDialog from "@/components/AddContactDialog";
import AddReminderDialog from "@/components/AddReminderDialog";
import {
  ArrowLeft, Edit2, Trash2, Phone, Mail, Globe, MessageCircle,
  Linkedin, Instagram, Twitter, CheckCircle2, Clock, Bell, Plus,
  Cake, CalendarDays, X
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";

const methodIcon: Record<string, React.ReactNode> = {
  phone: <Phone size={14} />, email: <Mail size={14} />, linkedin: <Linkedin size={14} />,
  instagram: <Instagram size={14} />, twitter: <Twitter size={14} />, website: <Globe size={14} />,
  whatsapp: <MessageCircle size={14} />, telegram: <MessageCircle size={14} />,
  facebook: <Globe size={14} />, other: <Globe size={14} />,
};

function ContactAvatar({ contact }: { contact: Contact }) {
  const bg = avatarBg(contact.firstName + contact.lastName);
  if (contact.photo) {
    return <img src={contact.photo} alt={contact.firstName} className="w-20 h-20 rounded-full object-cover" />;
  }
  return (
    <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: bg }}>
      {initials(contact.firstName, contact.lastName)}
    </div>
  );
}

export default function ContactDetail() {
  const [, params] = useRoute("/contacts/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const id = parseInt(params?.id ?? "0");

  const [editOpen, setEditOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [interactionNote, setInteractionNote] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  const { data: contact, isLoading } = useQuery<Contact>({
    queryKey: ["/api/contacts", id],
    enabled: !!id,
  });

  const { data: interactions = [] } = useQuery<Interaction[]>({
    queryKey: ["/api/contacts", id, "interactions"],
    queryFn: () => apiRequest("GET", `/api/contacts/${id}/interactions`).then((r) => r.json()),
    enabled: !!id,
  });

  const { data: reminders = [] } = useQuery<Reminder[]>({
    queryKey: ["/api/contacts", id, "reminders"],
    queryFn: () => apiRequest("GET", `/api/contacts/${id}/reminders`).then((r) => r.json()),
    enabled: !!id,
  });

  const logMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/contacts/${id}/interactions`, {
      contactedAt: new Date().toISOString(),
      note: interactionNote,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", id, "interactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", id, "reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reminders"] });
      setInteractionNote("");
      setShowNoteInput(false);
      toast({ title: "Contact logged!" });
    },
  });

  const deleteInteractionMutation = useMutation({
    mutationFn: (iid: number) => apiRequest("DELETE", `/api/interactions/${iid}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", id, "interactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      navigate("/contacts");
      toast({ title: "Contact deleted" });
    },
  });

  const dismissReminderMutation = useMutation({
    mutationFn: (rid: number) => apiRequest("POST", `/api/reminders/${rid}/dismiss`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts", id, "reminders"] }),
  });

  const deleteReminderMutation = useMutation({
    mutationFn: (rid: number) => apiRequest("DELETE", `/api/reminders/${rid}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/contacts", id, "reminders"] }),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="skeleton h-8 w-32" />
        <Card className="p-6">
          <div className="flex gap-5">
            <div className="skeleton w-20 h-20 rounded-full" />
            <div className="flex-1 space-y-3 pt-2">
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 w-64" />
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Contact not found.</p>
        <Button variant="link" onClick={() => navigate("/contacts")}>Back to contacts</Button>
      </div>
    );
  }

  const connectionTags = parseJSON<string[]>(contact.connectionTags, []);
  const industryTags = parseJSON<string[]>(contact.industryTags, []);
  const contactMethods = parseJSON<{ type: string; value: string }[]>(contact.contactMethods, []);
  const daysSince = contact.lastContactedAt
    ? differenceInDays(new Date(), parseISO(contact.lastContactedAt))
    : null;

  const activeReminders = reminders.filter((r) => !r.isDismissed);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate("/contacts")} data-testid="button-back">
          <ArrowLeft size={16} className="mr-1" />
          Contacts
        </Button>
      </div>

      {/* Header card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          <ContactAvatar contact={contact} />

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-semibold leading-tight">
                  {contact.firstName} {contact.lastName}
                </h1>
                {contact.birthday && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                    <Cake size={13} />
                    {format(new Date(contact.birthday + "T00:00:00"), "MMMM d")}
                  </p>
                )}
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Clock size={13} />
                  {contact.lastContactedAt
                    ? `Last contacted ${formatDistanceToNow(parseISO(contact.lastContactedAt))} ago`
                    : "Never contacted"}
                  {daysSince !== null && daysSince > 180 && (
                    <span className="text-orange-500 font-medium">· Overdue</span>
                  )}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditOpen(true)}
                  data-testid="button-edit-contact"
                >
                  <Edit2 size={14} className="mr-1.5" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" data-testid="button-delete-contact">
                      <Trash2 size={14} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {contact.firstName}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete this contact and all their interaction history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteContactMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-delete"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {connectionTags.map((t) => (
                <span key={t} className={`tag-pill ${tagColor(t)}`}>{t}</span>
              ))}
              {industryTags.map((t) => (
                <span key={t} className={`tag-pill bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Contact methods */}
        {contactMethods.length > 0 && (
          <Card className="p-4 space-y-3">
            <h2 className="text-sm font-semibold">Contact info</h2>
            <ul className="space-y-2">
              {contactMethods.map((m, i) => {
                const label = CONTACT_METHOD_TYPES.find((t) => t.value === m.type)?.label ?? m.type;
                const isLink = ["email", "website", "linkedin", "instagram", "twitter"].includes(m.type);
                const href = m.type === "email" ? `mailto:${m.value}`
                  : m.type === "phone" ? `tel:${m.value}`
                  : m.value;

                return (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <span className="text-muted-foreground">{methodIcon[m.type] ?? <Globe size={14} />}</span>
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{label}</span>
                    {isLink || m.type === "phone" ? (
                      <a href={href} target="_blank" rel="noopener noreferrer"
                        className="text-primary hover:underline truncate" data-testid={`link-contact-${m.type}-${i}`}>
                        {m.value}
                      </a>
                    ) : (
                      <span className="truncate">{m.value}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {/* Notes */}
        {contact.notes && (
          <Card className="p-4 space-y-2">
            <h2 className="text-sm font-semibold">Notes</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
          </Card>
        )}
      </div>

      {/* Log contact */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Log a contact</h2>
        </div>
        {showNoteInput ? (
          <div className="space-y-2">
            <Textarea
              placeholder="Optional note about this interaction…"
              value={interactionNote}
              onChange={(e) => setInteractionNote(e.target.value)}
              className="text-sm min-h-[80px]"
              data-testid="textarea-interaction-note"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => logMutation.mutate()}
                disabled={logMutation.isPending}
                data-testid="button-log-confirm"
              >
                <CheckCircle2 size={14} className="mr-1.5" />
                {logMutation.isPending ? "Logging…" : "Log now"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNoteInput(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => logMutation.mutate()}
              disabled={logMutation.isPending}
              data-testid="button-log-quick"
            >
              <CheckCircle2 size={14} className="mr-1.5" />
              Contacted today
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowNoteInput(true)}
              data-testid="button-log-with-note"
            >
              Add note
            </Button>
          </div>
        )}
      </Card>

      {/* Reminders */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Bell size={14} />
            Reminders
          </h2>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setReminderOpen(true)} data-testid="button-add-reminder">
            <Plus size={13} className="mr-1" />
            Add
          </Button>
        </div>

        {activeReminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active reminders.</p>
        ) : (
          <ul className="space-y-2">
            {activeReminders.map((r) => (
              <li key={r.id} className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
                <Bell size={13} className="text-amber-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.title}</p>
                  {r.dueDate && (
                    <p className="text-xs text-muted-foreground">{format(parseISO(r.dueDate), "MMM d, yyyy")}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={() => dismissReminderMutation.mutate(r.id!)}
                  data-testid={`button-dismiss-reminder-detail-${r.id}`}
                >
                  <X size={12} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteReminderMutation.mutate(r.id!)}
                  data-testid={`button-delete-reminder-${r.id}`}
                >
                  <Trash2 size={12} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Interaction history */}
      <Card className="p-4 space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-1.5">
          <CalendarDays size={14} />
          Interaction history
        </h2>
        {interactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No interactions logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {interactions.map((i) => (
              <li key={i.id} className="flex items-start gap-3 group">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                </div>
                <div className="flex-1 min-w-0 pb-3 border-b border-border last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(i.contactedAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => deleteInteractionMutation.mutate(i.id!)}
                      data-testid={`button-delete-interaction-${i.id}`}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                  {i.note && <p className="text-sm mt-0.5">{i.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Dialogs */}
      {editOpen && (
        <AddContactDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          mode="edit"
          defaultValues={{
            id: contact.id!,
            firstName: contact.firstName,
            lastName: contact.lastName,
            birthday: contact.birthday ?? "",
            notes: contact.notes ?? "",
            connectionTags,
            industryTags,
            contactMethods,
            photo: contact.photo ?? "",
          }}
        />
      )}

      <AddReminderDialog
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        contactId={id}
      />
    </div>
  );
}
